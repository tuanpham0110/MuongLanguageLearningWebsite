/**
 * Pronunciation check for Shadowing: how close is the learner's recording to the model sentence?
 *
 * Two engines, same response shape { score, transcript?, words?, comment?, engine }:
 *  1. SPEECH_API_URL configured → a dedicated pronunciation service (native-speaker comparison).
 *     Request (multipart/form-data): audio, referenceText, itemId, referenceAudio?
 *     Response (JSON): { score | similarity | percent, transcript?, words?, scores? }
 *  2. otherwise, when GEMINI_API_KEY is set → Gemini writes down what it hears (without knowing the
 *     model sentence) and the transcript is compared with the model sentence syllable by syllable
 *     here. This is an estimate, not a native-speaker comparison – the UI says so.
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { ah, parse } from '../../lib/http.js';
import { HttpError, badRequest, unavailable } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { requireAuth } from '../../middleware/auth.js';
import { aiLimiter } from '../../middleware/rateLimit.js';
import { getContent } from '../content/content.service.js';
import { refundQuota, takeQuota } from '../ai/quota.js';
import { sniff } from '../../lib/media.js';

const upload = multer({
    storage: multer.memoryStorage(), // recordings are never written to disk
    limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 1, fieldSize: 512, parts: 2 },
});

function clampPct(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(Math.max(0, Math.min(100, n <= 1 && !Number.isInteger(n) ? n * 100 : n)));
}

export function normalise(json, engine) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) throw new HttpError(502, 'Dịch vụ đối chiếu trả về dữ liệu không hợp lệ.', { code: 'speech-bad-response' });
    const score = clampPct(json.score ?? json.percent ?? (typeof json.similarity === 'number' && json.similarity <= 1 ? json.similarity * 100 : json.similarity));
    if (score == null) throw new HttpError(502, 'Dịch vụ chấm phát âm trả về dữ liệu không hợp lệ.', { code: 'speech-bad-response' });
    return {
        score,
        transcript: typeof json.transcript === 'string' && json.transcript.trim() ? json.transcript.trim().slice(0, 300) : null,
        words: Array.isArray(json.words)
            ? json.words.slice(0, 40).map((w) => ({ text: String(w.text ?? '').slice(0, 40), status: ['ok', 'miss', 'extra'].includes(w.status) ? w.status : 'ok', score: w.score ?? undefined }))
            : null,
        comment: typeof json.comment === 'string' && json.comment.trim() ? json.comment.trim().slice(0, 300) : null,
        scores: json.scores ?? null,
        engine,
    };
}

export function validateRecording(file) {
    if (!file?.size || !file.buffer?.length) throw badRequest('Chưa có bản ghi để so sánh.', { field: 'audio' });
    const type = sniff(file.buffer);
    if (!/^audio\//i.test(file.mimetype) || type?.kind !== 'audio') {
        throw badRequest('Bản ghi phải là âm thanh WebM, OGG, WAV, MP3 hoặc M4A hợp lệ.', { field: 'audio', code: 'speech-bad-audio' });
    }
    // Trust the detected container, never a browser-supplied MIME type or filename.
    return { ...file, mimetype: type.mime };
}

/* ───────────── Engine 1: dedicated pronunciation service ───────────── */
async function callProvider({ file, referenceText, itemId, referenceAudio, signal }) {
    const form = new FormData();
    form.append('audio', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'recording.webm');
    form.append('referenceText', referenceText);
    form.append('itemId', itemId);
    if (referenceAudio) form.append('referenceAudio', referenceAudio);

    const res = await fetch(env.SPEECH_API_URL, {
        method: 'POST',
        headers: env.SPEECH_API_KEY ? { Authorization: `Bearer ${env.SPEECH_API_KEY}` } : undefined,
        body: form,
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!res.ok) {
        logger.warn(`Speech API failed (${res.status})`);
        throw new HttpError(502, 'Không so sánh được lúc này. Vui lòng thử lại.', { code: 'speech-upstream' });
    }
    let json;
    try { json = await res.json(); }
    catch (error) {
        if (signal.aborted || error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
        throw new HttpError(502, 'Dịch vụ đối chiếu trả về dữ liệu không hợp lệ.', { code: 'speech-bad-response' });
    }
    return normalise(json, 'native');
}

/* ───────────── Engine 2: Gemini transcribes, we compare ─────────────
 * The model is NOT told the model sentence: asked to grade, it tends to echo the expected text and
 * hand out 100%. It only writes down what it hears; the similarity is computed here, syllable by
 * syllable, so a wrong or silent recording can never score well.
 */
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';
const TRY_NEXT = new Set([404, 408, 429, 500, 502, 503, 504]);

const TRANSCRIBE_PROMPT = `Hãy nghe bản ghi âm và chép lại CHÍNH XÁC từng âm tiết nghe được, viết bằng chữ Quốc ngữ (kiểu chính tả tiếng Việt, có dấu thanh).
Người nói có thể đang nói tiếng Mường (một ngôn ngữ dân tộc thiểu số ở Việt Nam, âm gần tiếng Việt), tiếng Việt hoặc ngôn ngữ khác: nghe thấy âm gì thì ghi âm đó, KHÔNG sửa thành từ tiếng Việt có nghĩa, KHÔNG dịch, KHÔNG thêm bớt.
Nếu không có tiếng người nói (im lặng, tiếng ồn) thì "transcript" là chuỗi rỗng và "speech" là false.`;

const TRANSCRIBE_SCHEMA = { type: 'OBJECT', properties: { speech: { type: 'BOOLEAN' }, transcript: { type: 'STRING' } }, required: ['speech', 'transcript'] };

async function transcribe(file, signal) {
    const payload = {
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: file.mimetype.split(';')[0], data: file.buffer.toString('base64') } }, { text: TRANSCRIBE_PROMPT }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json', responseSchema: TRANSCRIBE_SCHEMA },
    };
    let last = null;
    // the whole chain must answer before the browser gives up (40s) and well inside the function's 60s limit
    const deadline = Date.now() + 36_000;
    for (const model of env.aiModels) {
        signal.throwIfAborted();
        const left = deadline - Date.now();
        if (left < 4_000) break;
        try {
            const res = await fetch(`${GEMINI}/${encodeURIComponent(model)}:generateContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
                body: JSON.stringify(payload),
                signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(20_000, left))]),
            });
            if (!res.ok) throw Object.assign(new Error(`Gemini ${res.status}`), { status: res.status, body: await res.text().catch(() => '') });
            const data = await res.json();
            const json = JSON.parse(data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '');
            if (typeof json.speech !== 'boolean' || typeof json.transcript !== 'string') throw new Error('Invalid transcription response');
            return json.speech === false ? '' : json.transcript.trim().slice(0, 2000);
        } catch (e) {
            if (signal.aborted) throw signal.reason;
            last = e;
            logger.warn(`Speech via ${model} failed (${e.status ?? e.name})`);
            if (e.status != null && !TRY_NEXT.has(e.status)) break;
        }
    }
    if (last?.status === 400) throw new HttpError(502, 'Không đọc được bản ghi âm này. Hãy ghi âm lại rồi thử lại.', { code: 'speech-bad-audio' });
    throw unavailable('Công cụ chấm phát âm đang quá tải. Bạn thử lại sau ít phút nhé.', { code: 'speech-busy' });
}

/* ── similarity ── */
const syllables = (t) =>
    String(t ?? '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\s]/gu, ' ')
        .split(/\s+/)
        .filter(Boolean);
/** Exact normalized transcript agreement only; this does not measure acoustic pronunciation. */
export function syllableScore(ref, heard) {
    return Number(ref.normalize('NFC').toLowerCase() === heard.normalize('NFC').toLowerCase());
}

/**
 * Aligns the heard syllables with the model sentence (order kept) and scores the match.
 * Extra syllables cost points too, so reading a longer, different sentence does not pass.
 */
export function compare(referenceText, transcript) {
    const ref = syllables(referenceText);
    const heard = syllables(transcript);
    if (!heard.length) {
        return { score: 0, words: ref.map((text) => ({ text, status: 'miss', score: 0 })), comment: 'Chưa nghe thấy tiếng nói trong bản ghi. Hãy đưa micro gần hơn và đọc to, rõ từng tiếng.' };
    }
    const n = ref.length;
    const m = heard.length;
    // best[i][j] = best total similarity aligning ref[0..i) with heard[0..j)
    const best = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) best[i][j] = Math.max(best[i - 1][j], best[i][j - 1], best[i - 1][j - 1] + syllableScore(ref[i - 1], heard[j - 1]));
    }
    const per = new Array(n).fill(0);
    const used = new Array(m).fill(false);
    for (let i = n, j = m; i > 0 && j > 0; ) {
        const s = syllableScore(ref[i - 1], heard[j - 1]);
        if (best[i][j] === best[i - 1][j - 1] + s && s > 0) {
            per[i - 1] = s;
            used[j - 1] = true;
            i--;
            j--;
        } else if (best[i][j] === best[i - 1][j]) i--;
        else j--;
    }
    const extras = heard.filter((_, j) => !used[j]);
    const score = Math.round((100 * per.reduce((a, b) => a + b, 0)) / Math.max(n, m));
    const words = [
        ...ref.map((text, i) => ({ text, status: per[i] === 1 ? 'ok' : 'miss', score: Math.round(per[i] * 100) })),
        ...extras.slice(0, 6).map((text) => ({ text, status: 'extra' })),
    ];
    const weak = words.filter((w) => w.status === 'miss').map((w) => `“${w.text}”`);
    const comment = score === 100
        ? 'Bản chép trùng toàn bộ câu mẫu. Kết quả này không xác nhận phát âm, thanh điệu hay ngữ điệu chính xác.'
        : `Bản chép ${weak.length ? `chưa trùng ${weak.slice(0, 4).join(', ')}` : 'có thêm âm tiết'}. Máy có thể nhận dạng sai tiếng Mường; hãy tự nghe lại bản ghi và câu mẫu.`;
    return { score: Math.max(0, Math.min(100, score)), words, comment };
}

async function assessWithGemini({ file, referenceText, signal }) {
    const transcript = await transcribe(file, signal);
    return normalise({ ...compare(referenceText, transcript), transcript }, 'ai');
}

export const speechRoutes = Router();

speechRoutes.post(
    '/assess',
    requireAuth,
    aiLimiter,
    upload.single('audio'),
    ah(async (req, res) => {
        if (!env.speechEnabled) throw unavailable('Tính năng chấm phát âm chưa được bật trên máy chủ.', { code: 'speech-disabled' });
        const file = validateRecording(req.file);
        const { itemId } = parse(z.object({ itemId: z.string().min(1).max(100) }), req.body);

        // the reference always comes from our own content, never from the client
        const C = await getContent();
        const item = C.ITEMS[itemId];
        if (!item || item.part !== 'shadow') throw badRequest('Câu luyện nói không tồn tại.');

        const client = new AbortController();
        const onClose = () => { if (!res.writableEnded) client.abort(); };
        res.on('close', onClose);
        if (env.SPEECH_API_URL) {
            try { return res.json(await callProvider({ file, referenceText: item.text, itemId, referenceAudio: item.audioUrl, signal: client.signal })); }
            catch (error) {
                if (client.signal.aborted) return void res.end();
                if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new HttpError(504, 'Dịch vụ đối chiếu chưa phản hồi. Hãy thử lại sau.', { code: 'speech-timeout' });
                throw error;
            }
            finally { res.off('close', onClose); }
        }
        // the Gemini check spends the same daily budget as the tutor chat; a failed check is not counted
        const day = await takeQuota(req.user.id);
        try {
            const result = await assessWithGemini({ file, referenceText: item.text, signal: client.signal });
            client.signal.throwIfAborted();
            res.json(result);
        } catch (e) {
            await refundQuota(req.user.id, day);
            if (client.signal.aborted) return void res.end();
            throw e;
        } finally {
            res.off('close', onClose);
        }
    })
);
