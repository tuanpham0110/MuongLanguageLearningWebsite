import { prisma } from '../../lib/prisma.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { createMessageOnce } from '../messages/delivery.js';

const author = { id: true, name: true, role: true };
const pageSize = 50;
const cursorOf = (message) => `p${message.position}`;
const toMessage = (m) => ({
    id: m.id,
    position: m.position,
    body: m.deletedAt ? '' : m.body,
    at: m.createdAt.getTime(),
    deleted: !!m.deletedAt,
    author: { id: m.user.id, name: m.user.name, role: m.user.role },
});

export function createCommunityService(db = prisma) {
    async function unread(userId) {
        const state = await db.user.findUnique({ where: { id: userId }, select: { communityReadAt: true, communityReadId: true, communityReadPosition: true } });
        if (!state) throw notFound('Không tìm thấy tài khoản.');
        return {
            unread: await db.communityMessage.count({ where: { userId: { not: userId }, deletedAt: null, position: { gt: state.communityReadPosition } } }),
            lastRead: state.communityReadAt ? { at: state.communityReadAt.getTime(), id: state.communityReadId ?? '', position: state.communityReadPosition } : null,
        };
    }
    return {
        unread,
        async markRead(userId, messageId) {
            const message = await db.communityMessage.findUnique({ where: { id: messageId }, select: { id: true, createdAt: true, position: true } });
            if (!message) throw notFound('Không tìm thấy tin nhắn.');
            // Conditional update keeps a slow/older tab from moving the shared read cursor back.
            await db.user.updateMany({ where: { id: userId, communityReadPosition: { lt: message.position } },
                data: { communityReadAt: message.createdAt, communityReadId: message.id, communityReadPosition: message.position } });
            return unread(userId);
        },
        async list({ before, after, since } = {}, viewerId) {
            // Start the next deletion window before these reads. Overlapping windows tolerate
            // concurrent requests; deleted text is never returned, including in older pages.
            const syncedAt = Date.now();
            let where = {};
            if (before || after) {
                const token = before || after;
                const direction = after ? 'gt' : 'lt';
                if (token.startsWith('p')) {
                    where = { position: { [direction]: Number(token.slice(1)) } };
                } else {
                    // Cached clients may still send a timestamp cursor. Catch up from the
                    // beginning for live updates; old history links keep their timestamp bound.
                    const separator = token.indexOf('_');
                    const cursor = { createdAt: new Date(Number(token.slice(0, separator))), id: token.slice(separator + 1) };
                    if (Number.isNaN(cursor.createdAt.getTime())) throw badRequest('Mốc lịch sử không hợp lệ.');
                    where = after ? { position: { gt: 0 } } : { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] };
                }
            }
            const [rows, removed, readState] = await Promise.all([
                db.communityMessage.findMany({ where, orderBy: { position: after ? 'asc' : 'desc' }, take: pageSize + 1, include: { user: { select: author } } }),
                since == null ? [] : db.communityMessage.findMany({ where: { deletedAt: { gte: new Date(Math.max(0, since - 60_000)) } }, select: { id: true } }),
                viewerId && !before && !after ? unread(viewerId) : null,
            ]);
            const page = rows.slice(0, pageSize);
            return {
                messages: after ? page.map(toMessage) : page.map(toMessage).reverse(),
                nextBefore: !after && rows.length > pageSize ? cursorOf(page.at(-1)) : null,
                nextAfter: after && rows.length > pageSize ? cursorOf(page.at(-1)) : null,
                latestCursor: page.length ? cursorOf(after ? page.at(-1) : page[0]) : after ?? 'p0',
                removedIds: removed.map((m) => m.id),
                syncedAt,
                ...(readState ? { readState } : {}),
            };
        },

        async send(user, body, clientMessageId) {
            return toMessage(await createMessageOnce(db.communityMessage, {
                key: clientMessageId ? { userId_clientMessageId: { userId: user.id, clientMessageId } } : null,
                data: { userId: user.id, body, clientMessageId },
                include: { user: { select: author } },
            }));
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
