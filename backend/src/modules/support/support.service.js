/**
 * Support inbox: one conversation per learner, answered by the admins.
 * A message belongs to the learner's thread (`userId`); `fromAdmin` tells who wrote it.
 * `readAt` is set when the other side opens the thread.
 */
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { createMessageOnce } from '../messages/delivery.js';

const toMessage = (m) => ({ id: m.id, fromAdmin: m.fromAdmin, body: m.body, at: m.createdAt.getTime(), read: !!m.readAt });

export function createSupportService(db = prisma) {
    return {
        /* ───── learner ───── */
        /** Loading a conversation never changes read receipts. */
        async thread(userId) {
            const rows = await db.supportMessage.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
            return rows.map(toMessage);
        },

        async markRead(userId, messageIds) {
            await db.supportMessage.updateMany({ where: { userId, id: { in: messageIds }, fromAdmin: true, readAt: null }, data: { readAt: new Date() } });
            return { ok: true };
        },

        unread: (userId) => db.supportMessage.count({ where: { userId, fromAdmin: true, readAt: null } }),

        async send(user, body, clientMessageId) {
            const m = await createMessageOnce(db.supportMessage, {
                key: clientMessageId ? { senderId_clientMessageId: { senderId: user.id, clientMessageId } } : null,
                data: { userId: user.id, senderId: user.id, fromAdmin: false, body, clientMessageId },
            });
            return toMessage(m);
        },

        /* ───── admin ───── */
        /** Every conversation, newest activity first, with the number of learner messages not read yet. */
        async threads() {
            const [last, unread] = await Promise.all([
                db.supportMessage.groupBy({ by: ['userId'], _max: { createdAt: true }, _count: { _all: true } }),
                db.supportMessage.groupBy({ by: ['userId'], where: { fromAdmin: false, readAt: null }, _count: { _all: true } }),
            ]);
            if (!last.length) return [];
            const ids = last.map((t) => t.userId);
            const [users, previews] = await Promise.all([
                db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }),
                db.supportMessage.findMany({ where: { userId: { in: ids } }, orderBy: { createdAt: 'desc' }, distinct: ['userId'], select: { userId: true, body: true, fromAdmin: true } }),
            ]);
            const U = new Map(users.map((u) => [u.id, u]));
            const P = new Map(previews.map((p) => [p.userId, p]));
            const N = new Map(unread.map((u) => [u.userId, u._count._all]));
            return last
                .filter((t) => U.has(t.userId))
                .map((t) => ({
                    user: U.get(t.userId),
                    lastAt: t._max.createdAt.getTime(),
                    total: t._count._all,
                    unread: N.get(t.userId) ?? 0,
                    preview: (P.get(t.userId)?.body ?? '').slice(0, 120),
                    lastFromAdmin: !!P.get(t.userId)?.fromAdmin,
                }))
                .sort((a, b) => (b.unread > 0) - (a.unread > 0) || b.lastAt - a.lastAt);
        },

        /** The inbox preview and its loaded history do not consume unread messages. */
        async adminThread(userId) {
            const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, createdAt: true } });
            if (!user) throw notFound('Không tìm thấy người dùng.');
            const rows = await db.supportMessage.findMany({ where: { userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
            return { user: { ...user, createdAt: user.createdAt.getTime() }, messages: rows.map(toMessage) };
        },

        async adminMarkRead(userId, messageIds) {
            await db.supportMessage.updateMany({ where: { userId, id: { in: messageIds }, fromAdmin: false, readAt: null }, data: { readAt: new Date() } });
            return { ok: true };
        },

        async reply(userId, body, clientMessageId, senderId) {
            const exists = await db.user.count({ where: { id: userId } });
            if (!exists) throw notFound('Không tìm thấy người dùng.');
            return toMessage(await createMessageOnce(db.supportMessage, {
                key: clientMessageId ? { senderId_clientMessageId: { senderId, clientMessageId } } : null,
                data: { userId, senderId, fromAdmin: true, body, clientMessageId },
            }));
        },

        adminUnread: () => db.supportMessage.count({ where: { fromAdmin: false, readAt: null } }),
    };
}

export const supportService = createSupportService();
