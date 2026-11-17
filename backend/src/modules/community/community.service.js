import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';

const author = { id: true, name: true, role: true };
const pageSize = 50;
const cursorOf = (message) => `${message.createdAt.getTime()}_${message.id}`;
const toMessage = (m) => ({
    id: m.id,
    body: m.deletedAt ? '' : m.body,
    at: m.createdAt.getTime(),
    deleted: !!m.deletedAt,
    author: { id: m.user.id, name: m.user.name, role: m.user.role },
});

export function createCommunityService(db = prisma) {
    return {
        async list({ before, after, since } = {}) {
            // Start the next deletion window before these reads. Overlapping windows tolerate
            // concurrent requests; deleted text is never returned, including in older pages.
            const syncedAt = Date.now();
            let where = {};
            if (before || after) {
                const token = before || after;
                const separator = token.indexOf('_');
                const cursor = { createdAt: new Date(Number(token.slice(0, separator))), id: token.slice(separator + 1) };
                if (Number.isNaN(cursor.createdAt.getTime())) throw badRequest('Mốc lịch sử không hợp lệ.');
                const direction = after ? 'gt' : 'lt';
                where = { OR: [{ createdAt: { [direction]: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { [direction]: cursor.id } }] };
            }
            const [rows, removed] = await Promise.all([
                db.communityMessage.findMany({ where, orderBy: [{ createdAt: after ? 'asc' : 'desc' }, { id: after ? 'asc' : 'desc' }], take: pageSize + 1, include: { user: { select: author } } }),
                since == null ? [] : db.communityMessage.findMany({ where: { deletedAt: { gte: new Date(Math.max(0, since - 60_000)) } }, select: { id: true } }),
            ]);
            const page = rows.slice(0, pageSize);
            return {
                messages: after ? page.map(toMessage) : page.map(toMessage).reverse(),
                nextBefore: !after && rows.length > pageSize ? cursorOf(page.at(-1)) : null,
                nextAfter: after && rows.length > pageSize ? cursorOf(page.at(-1)) : null,
                latestCursor: page.length ? cursorOf(after ? page.at(-1) : page[0]) : after ?? `${syncedAt}_0`,
                removedIds: removed.map((m) => m.id),
                syncedAt,
            };
        },

        async send(user, body) {
            return toMessage(await db.communityMessage.create({ data: { userId: user.id, body }, include: { user: { select: author } } }));
        },

        async remove(user, id) {
            const message = await db.communityMessage.findUnique({ where: { id } });
            if (!message) throw notFound('Không tìm thấy tin nhắn.');
            if (message.userId !== user.id && user.role !== 'admin') throw forbidden('Bạn chỉ có thể gỡ tin nhắn của mình.');
            await db.communityMessage.updateMany({ where: { id, deletedAt: null }, data: { body: '', deletedAt: new Date() } });
            const removed = await db.communityMessage.findUnique({ where: { id }, include: { user: { select: author } } });
            if (!removed) throw notFound('Không tìm thấy tin nhắn.');
            return toMessage(removed);
        },
    };
}

export const communityService = createCommunityService();
