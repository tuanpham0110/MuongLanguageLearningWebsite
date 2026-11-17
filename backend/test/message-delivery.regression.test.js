import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/delivery_test', JWT_SECRET: 'isolated-delivery-test-secret-at-least-32-characters' });
const { createSupportService } = await import('../src/modules/support/support.service.js');

function fixture() {
    const rows = [];
    const match = (m, w) => (!w.userId || m.userId === w.userId) && (w.fromAdmin == null || m.fromAdmin === w.fromAdmin) && (w.readAt !== null || !m.readAt) && (!w.id || w.id.in.includes(m.id));
    const db = {
        user: { count: async () => 1, findUnique: async ({ where }) => ({ id: where.id, createdAt: new Date(0) }) },
        supportMessage: {
            findUnique: async ({ where }) => rows.find((m) => m.senderId === where.senderId_clientMessageId.senderId && m.clientMessageId === where.senderId_clientMessageId.clientMessageId) ?? null,
            findMany: async ({ where }) => rows.filter((m) => match(m, where)).map((m) => ({ ...m })),
            count: async ({ where }) => rows.filter((m) => match(m, where)).length,
            create: async ({ data }) => {
                await Promise.resolve();
                if (data.clientMessageId && rows.some((m) => m.senderId === data.senderId && m.clientMessageId === data.clientMessageId)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
                const row = { ...data, id: `m${rows.length}`, createdAt: new Date(), readAt: null };
                rows.push(row);
                return row;
            },
            updateMany: async ({ where, data }) => { rows.filter((m) => match(m, where)).forEach((m) => Object.assign(m, data)); return { count: 1 }; },
        },
    };
    return { rows, service: createSupportService(db) };
}

test('learner and admin retries are idempotent and cannot replay into another conversation', async () => {
    const { rows, service } = fixture();
    const key = 'ddcc25de-75ed-41a4-a728-cf147992d522';
    const messages = await Promise.all(Array.from({ length: 8 }, () => service.send({ id: 'learner' }, 'Cần hỗ trợ', key)));
    assert.equal(rows.length, 1);
    assert.equal(new Set(messages.map((m) => m.id)).size, 1);
    await assert.rejects(service.send({ id: 'learner' }, 'Nội dung thay đổi', key), { status: 409 });
    const replies = await Promise.all(Array.from({ length: 8 }, () => service.reply('learner', 'Mình đã xem', key, 'admin')));
    assert.equal(rows.length, 2);
    assert.equal(new Set(replies.map((m) => m.id)).size, 1);
    await assert.rejects(service.reply('another', 'Mình đã xem', key, 'admin'), { status: 409 });
});

test('GET history never changes read receipts; acknowledgements only touch visible IDs in their thread/direction', async () => {
    const { rows, service } = fixture();
    const a = await service.reply('learner', 'Tin thấy trên màn hình', undefined, 'admin');
    const b = await service.reply('learner', 'Tin chưa xem', undefined, 'admin');
    const c = await service.reply('another', 'Tin của người khác', undefined, 'admin');
    const own = await service.send({ id: 'learner' }, 'Câu hỏi của tôi');
    await service.thread('learner');
    await service.adminThread('learner');
    assert.equal(await service.unread('learner'), 2);
    await service.markRead('learner', [a.id, c.id, own.id]);
    assert.equal(await service.unread('learner'), 1);
    assert.equal(rows.find((m) => m.id === b.id).readAt, null);
    assert.equal(rows.find((m) => m.id === c.id).readAt, null);
    assert.equal(rows.find((m) => m.id === own.id).readAt, null);
    await service.adminMarkRead('learner', [own.id, b.id]);
    assert.ok(rows.find((m) => m.id === own.id).readAt);
    assert.equal(rows.find((m) => m.id === b.id).readAt, null);
});
