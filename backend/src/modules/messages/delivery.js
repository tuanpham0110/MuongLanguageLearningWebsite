import { z } from 'zod';
import { conflict } from '../../lib/errors.js';

export const clientMessageId = z.string().uuid().optional();
export const readMessagesBody = z.object({ messageIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/)).min(1).max(200) });

/** A retry returns the original record, including when two requests race to insert it. */
export async function createMessageOnce(model, { key, data, include }) {
    const replay = (row) => {
        if (row.userId !== data.userId || row.fromAdmin !== data.fromAdmin || (!row.deletedAt && row.body !== data.body)) {
            throw conflict('Mã gửi tin này đã được sử dụng. Hãy gửi một tin nhắn mới.', { code: 'message-key-reused' });
        }
        return row;
    };
    if (!key) return model.create({ data, ...(include ? { include } : {}) });
    const query = { where: key, ...(include ? { include } : {}) };
    const existing = await model.findUnique(query);
    if (existing) return replay(existing);
    try {
        return await model.create({ data, ...(include ? { include } : {}) });
    } catch (error) {
        if (error.code !== 'P2002') throw error;
        const saved = await model.findUnique(query);
        if (!saved) throw error;
        return replay(saved);
    }
}
