import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

function dedicated(value) {
    try { const url = new URL(value); return ['postgres:', 'postgresql:'].includes(url.protocol) && /(?:^|[_-])test$/i.test(url.pathname.slice(1)); }
    catch { return false; }
}
if (process.env.RUN_DB_TESTS !== 'true' || !dedicated(process.env.TEST_DATABASE_URL)) {
    test('message delivery DB tests require explicit opt-in and a dedicated *_test DB', { skip: true }, () => {});
} else {
    Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, JWT_SECRET: crypto.randomBytes(48).toString('hex') });
    const { prisma } = await import('../src/lib/prisma.js');
    const { PrismaClient } = await import('@prisma/client');
    const { createCommunityService } = await import('../src/modules/community/community.service.js');
    const { createSupportService } = await import('../src/modules/support/support.service.js');
    const room = createCommunityService(prisma), support = createSupportService(prisma);
    const owned = [];
    const createUser = async () => {
        const u = await prisma.user.create({ data: { name: 'Message fixture', email: `${crypto.randomUUID()}@delivery.test`, passwordHash: 'fixture', verified: true } });
        owned.push(u.id);
        return u;
    };
    after(async () => { await prisma.user.deleteMany({ where: { id: { in: owned } } }); await prisma.$disconnect(); });

    test('PostgreSQL serializes committed chat positions, including backwards timestamps', async () => {
        const sender = await createUser(), viewer = await createUser();
        const other = new PrismaClient();
        await other.$connect();
        const baseline = await room.list();
        let inserted, release;
        const started = new Promise((resolve) => { inserted = resolve; });
        const gate = new Promise((resolve) => { release = resolve; });
        const first = prisma.$transaction(async (tx) => {
            const m = await tx.communityMessage.create({ data: { userId: sender.id, body: 'first-held', createdAt: new Date(Date.now() + 60_000) } });
            inserted(m);
            await gate;
            return m;
        }, { timeout: 10_000 });
        const firstRow = await started;
        let second;
        try {
            second = other.communityMessage.create({ data: { userId: sender.id, body: 'second-old-clock', createdAt: new Date(1) } });
            // Start the lazy Prisma query before polling the lock state.
            second = Promise.resolve(second);
            let blocked = false;
            for (let i = 0; i < 80; i++) {
                const rows = await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event = 'advisory'`;
                if (rows[0].n > 0) { blocked = true; break; }
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            assert.equal(blocked, true, 'the second insert must wait for the first commit');
            assert.equal((await room.list({ after: baseline.latestCursor })).messages.some((m) => m.id === firstRow.id), false);
        } finally { release(); }
        try {
            const [a, b] = await Promise.all([first, second]);
            assert.ok(a.position < b.position);
            assert.ok(b.createdAt < a.createdAt);
            const delivered = await room.list({ after: baseline.latestCursor });
            assert.deepEqual(delivered.messages.filter((m) => m.author.id === sender.id).map((m) => m.id), [a.id, b.id]);
            await room.markRead(viewer.id, a.id);
            assert.equal((await room.unread(viewer.id)).unread, 1);
        } finally { await other.$disconnect(); }
    });

    test('real unique constraints deduplicate concurrent learner/admin/community retries', async () => {
        const learner = await createUser(), admin = await createUser();
        const key = crypto.randomUUID();
        const a = await Promise.all(Array.from({ length: 8 }, () => support.send(learner, 'support retry', key)));
        const b = await Promise.all(Array.from({ length: 8 }, () => support.reply(learner.id, 'admin retry', key, admin.id)));
        const c = await Promise.all(Array.from({ length: 8 }, () => room.send(learner, 'room retry', key)));
        for (const group of [a, b, c]) assert.equal(new Set(group.map((m) => m.id)).size, 1);
        assert.equal(await prisma.supportMessage.count({ where: { userId: learner.id } }), 2);
        assert.equal(await prisma.communityMessage.count({ where: { userId: learner.id } }), 1);
    });

    test('migration preserves old messages and maps existing read boundaries to positions', async () => {
        const sql = await readFile(new URL('../prisma/migrations/20261117160000_reliable_messages/migration.sql', import.meta.url), 'utf8');
        const statements = [];
        let buffer = '', body = false;
        for (const line of sql.split('\n')) {
            buffer += `${line}\n`;
            if (line.includes('AS $$')) body = true;
            if (line.includes('$$ LANGUAGE plpgsql;')) body = false;
            if (!body && line.trimEnd().endsWith(';')) { if (!['BEGIN;', 'COMMIT;'].includes(buffer.trim())) statements.push(buffer); buffer = ''; }
        }
        const schema = `delivery_${crypto.randomBytes(6).toString('hex')}`;
        const rollback = new Error('rollback isolated migration fixture');
        await assert.rejects(prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
            await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
            await tx.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "communityReadAt" TIMESTAMP(3), "communityReadId" TEXT)');
            await tx.$executeRawUnsafe('CREATE TABLE "SupportMessage" ("id" TEXT PRIMARY KEY)');
            await tx.$executeRawUnsafe('CREATE TABLE "CommunityMessage" ("id" TEXT PRIMARY KEY, "userId" TEXT, "body" TEXT, "createdAt" TIMESTAMP(3), "deletedAt" TIMESTAMP(3))');
            await tx.$executeRaw`INSERT INTO "User" VALUES ('reader', ${new Date(1000)}, 'b')`;
            await tx.$executeRaw`INSERT INTO "CommunityMessage" VALUES ('a', 'u', 'kept-a', ${new Date(1000)}, NULL), ('b', 'u', 'kept-b', ${new Date(1000)}, NULL), ('c', 'u', 'kept-c', ${new Date(2000)}, NULL)`;
            for (const statement of statements) await tx.$executeRawUnsafe(statement);
            const messages = await tx.$queryRaw`SELECT "id", "body", "position" FROM "CommunityMessage" ORDER BY "position"`;
            assert.deepEqual(messages.map((m) => [m.id, m.body, m.position]), [['a', 'kept-a', 1], ['b', 'kept-b', 2], ['c', 'kept-c', 3]]);
            assert.equal((await tx.$queryRaw`SELECT "communityReadPosition" FROM "User"`)[0].communityReadPosition, 2);
            const inserted = await tx.$queryRaw`INSERT INTO "CommunityMessage" ("id", "userId", "body", "createdAt") VALUES ('d', 'u', 'kept-d', ${new Date(0)}) RETURNING "position"`;
            assert.ok(inserted[0].position > 3);
            throw rollback;
        }, { timeout: 15_000 }), (error) => error === rollback);
    });
}
