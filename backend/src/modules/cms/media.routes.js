/**
 * Admin uploads (images for exercises, native-speaker recordings) and their public delivery.
 *
 * Upload safety: the type is decided from the file's own bytes (magic numbers), never from the
 * name or the browser's Content-Type; only a short list of image/audio formats is accepted (no SVG,
 * no HTML); files are capped at 2 MB and served with nosniff and an inline disposition.
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ah, parse } from '../../lib/http.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sniff } from '../../lib/media.js';
export { sniff } from '../../lib/media.js';

export const MAX_MEDIA_BYTES = 2 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MEDIA_BYTES, files: 1 } });

export const mediaRoutes = Router();

mediaRoutes.get(
    '/',
    ah(async (_req, res) => {
        const rows = await prisma.media.findMany({ orderBy: { createdAt: 'desc' }, take: 200, select: { id: true, kind: true, mime: true, name: true, size: true, createdAt: true } });
        res.json(rows.map((m) => ({ ...m, url: `/api/media/${m.id}`, createdAt: m.createdAt.getTime() })));
    })
);

mediaRoutes.post(
    '/',
    upload.single('file'),
    ah(async (req, res) => {
        if (!req.file?.size) throw badRequest('Chưa chọn tệp.', { field: 'file' });
        const type = sniff(req.file.buffer);
        if (!type) throw badRequest('Chỉ nhận ảnh PNG, JPEG, WebP hoặc âm thanh MP3, WAV, OGG, WebM, M4A.', { field: 'file', code: 'media-type' });
        const name = String(req.file.originalname || 'tep').normalize('NFC').replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 120) || 'tep';
        const m = await prisma.media.create({ data: { kind: type.kind, mime: type.mime, name, size: req.file.size, data: req.file.buffer, createdBy: req.user.id } });
        logger.info(`[cms] ${req.user.email} uploaded media ${m.id} (${type.mime}, ${req.file.size} B)`);
        res.status(201).json({ id: m.id, kind: m.kind, mime: m.mime, name: m.name, size: m.size, url: `/api/media/${m.id}` });
    })
);

mediaRoutes.delete(
    '/:id',
    ah(async (req, res) => {
        const id = parse(z.string().regex(/^[\w-]{1,60}$/), req.params.id);
        if (!(await prisma.media.count({ where: { id } }))) throw notFound('Không tìm thấy tệp.');
        const url = `/api/media/${id}`;
        const [items, words, sentences] = await Promise.all([
            prisma.item.findMany({ select: { id: true, data: true } }),
            prisma.vocabulary.count({ where: { audioUrl: url } }),
            prisma.sentence.count({ where: { audioUrl: url } }),
        ]);
        const usedBy = items.filter((i) => i.data?.audioUrl === url || i.data?.imageUrl === url).map((i) => i.id);
        if (usedBy.length || words || sentences) throw conflict('Tệp đang được dùng trong nội dung. Hãy gỡ khỏi câu bài tập / từ vựng trước.', { code: 'media-in-use' });
        await prisma.media.delete({ where: { id } });
        logger.info(`[cms] ${req.user.email} deleted media ${id}`);
        res.json({ ok: true });
    })
);

/* ───────────── Public delivery: GET /api/media/:id ───────────── */
export const publicMediaRoutes = Router();

publicMediaRoutes.get(
    '/:id',
    ah(async (req, res) => {
        const id = parse(z.string().regex(/^[\w-]{1,60}$/, 'Không tìm thấy tệp.'), req.params.id);
        const m = await prisma.media.findUnique({ where: { id } });
        if (!m) throw notFound('Không tìm thấy tệp.');
        const data = Buffer.from(m.data);
        res.set({
            'Content-Type': m.mime,
            'Cache-Control': 'public, max-age=31536000, immutable', // a file never changes under its id
            'Content-Disposition': 'inline',
            'Accept-Ranges': 'bytes',
            'Cross-Origin-Resource-Policy': 'same-site',
        });
        // Safari only plays audio served with byte ranges
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
        if (range && (range[1] || range[2])) {
            let start = range[1] ? Number(range[1]) : data.length - Number(range[2]);
            let end = range[1] && range[2] ? Number(range[2]) : data.length - 1;
            start = Math.max(0, start);
            end = Math.min(end, data.length - 1);
            if (start > end) return res.status(416).set('Content-Range', `bytes */${data.length}`).end();
            return res.status(206).set('Content-Range', `bytes ${start}-${end}/${data.length}`).send(data.subarray(start, end + 1));
        }
        res.send(data);
    })
);
