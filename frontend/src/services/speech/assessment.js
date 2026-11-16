/**
 * Native-speaker comparison – calls the backend (/api/speech/assess), which
 * forwards the recording to the pronunciation service and normalises the result:
 *   { score: 0–100, transcript?, words?: [{ text, status: 'ok'|'miss'|'extra', score? }], scores? }
 *
 * Whether the service is available comes from GET /api/meta (`speech`).
 * Privacy: the recording is uploaded only when the learner presses the compare button.
 */
import { request } from '../api.js';

/** Rating band for a similarity %. `engine`: 'native' (pronunciation service) | 'ai' (AI estimate). */
export function band(score, engine = 'native') {
    if (engine === 'ai') return { key: 'again', label: `Bản chép trùng ${score}% âm tiết; hãy tự nghe và đánh giá`, tone: score === 100 ? 'ok' : 'mid' };
    if (score >= 85) return { key: 'good', label: 'Rất giống người bản địa', tone: 'ok' };
    if (score >= 65) return { key: 'ok', label: 'Khá giống, cần chỉnh nhẹ', tone: 'mid' };
    return { key: 'again', label: 'Cần luyện thêm', tone: 'bad' };
}

export const assessor = {
    name: 'So sánh với người bản địa',
    /**
     * @param {Blob} audioBlob
     * @param {{ itemId: string }} reference
     * @param {AbortSignal} [signal]
     */
    async assess(audioBlob, { itemId }, signal) {
        if (!audioBlob?.size) throw new Error('Chưa có bản ghi để so sánh.');
        if (audioBlob.size > 2 * 1024 * 1024) throw new Error('Bản ghi quá lớn (tối đa 2 MB). Hãy ghi âm ngắn hơn.');
        if (!/^audio\//i.test(audioBlob.type)) throw new Error('Định dạng bản ghi không được hỗ trợ. Hãy ghi âm lại.');
        const ext = (audioBlob.type.split('/')[1] || 'webm').split(';')[0];
        const form = new FormData();
        form.append('itemId', itemId);
        form.append('audio', audioBlob, `recording.${ext}`);
        return request('POST', '/speech/assess', { form, signal, timeout: 40000 });
    },
};
