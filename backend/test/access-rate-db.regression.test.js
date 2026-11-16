import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

function dedicated(value) {
    try { const url = new URL(value); return ['postgres:', 'postgresql:'].includes(url.protocol) && /(?:^|[_-])test$/i.test(url.pathname.slice(1)); }
    catch { return false; }
}

if (process.env.RUN_DB_TESTS !== 'true' || !dedicated(process.env.TEST_DATABASE_URL)) {
    test('access/rate migration regression requires explicit opt-in and dedicated *_test DB', { skip: true }, () => {});
} else {
    Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: process.env.TEST_DATABASE_URL, JWT_SECRET: crypto.randomBytes(48).toString('hex') });
    const { prisma } = await import('../src/lib/prisma.js');
    const { PrismaClient } = await import('@prisma/client');
    const { PostgresRateLimitStore } = await import('../src/middleware/rateLimitStore.js');

    test('ARCH-01 PostgreSQL counters are atomic across separate connections, expire and reset', async () => {
        const other = new PrismaClient();
        const prefix = `audit-${crypto.randomUUID()}`;
        const a = new PostgresRateLimitStore(prefix, prisma);
        const b = new PostgresRateLimitStore(prefix, other);
        a.init({ windowMs: 60_000 }); b.init({ windowMs: 60_000 });
        const key = a.keyFor('fixture');
        try {
            const hits = await Promise.all(Array.from({ length: 24 }, (_, i) => (i % 2 ? a : b).increment('fixture')));
            assert.deepEqual(hits.map((h) => h.totalHits).sort((x, y) => x - y), Array.from({ length: 24 }, (_, i) => i + 1));
            assert.equal(new Set(hits.map((h) => h.resetTime.getTime())).size, 1);
            await prisma.requestRateLimit.update({ where: { key }, data: { resetAt: new Date(0) } });
            assert.equal((await b.increment('fixture')).totalHits, 1);
            await a.decrement('fixture'); await a.decrement('fixture');
            assert.equal((await prisma.requestRateLimit.findUniqueOrThrow({ where: { key } })).hits, 0);
            await a.resetKey('fixture');
            assert.equal(await prisma.requestRateLimit.findUnique({ where: { key } }), null);
        } finally {
            await prisma.requestRateLimit.deleteMany({ where: { key } });
            await other.$disconnect();
        }
    });

    test('LOG-01 migration preserves existing learners and backfills only earned/currently open stages', async () => {
        const migrations = ['20261113162758_init', '20261114090000_ai_usage', '20261114100000_account_security', '20261114120000_admin_support', '20261115090000_cms_media'];
        const sql = await Promise.all([...migrations, '20261116090000_access_and_rate_limits'].map((id) => readFile(new URL(`../prisma/migrations/${id}/migration.sql`, import.meta.url), 'utf8')));
        const schema = `audit_${crypto.randomBytes(8).toString('hex')}`;
        const rollback = new Error('rollback isolated migration fixture');
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
                await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
                for (const migration of sql.slice(0, -1)) await tx.$executeRawUnsafe(`DO $audit$ BEGIN\n${migration}\nEND $audit$`);
                await tx.$executeRaw`INSERT INTO "User" ("id", "name", "email", "passwordHash", "updatedAt") VALUES
                    ('new', 'New', 'new@test.local', 'fixture', NOW()), ('completed', 'Completed', 'complete@test.local', 'fixture', NOW()),
                    ('active', 'Active', 'active@test.local', 'fixture', NOW())`;
                await tx.$executeRaw`INSERT INTO "Stage" ("id", "code", "tone", "title", "summary", "position") VALUES
                    (1, 's1', 'a', 'one', '', 0), (2, 's2', 'a', 'two', '', 1), (3, 's3', 'a', 'empty', '', 2), (4, 's4', 'a', 'four', '', 3)`;
                await tx.$executeRaw`INSERT INTO "Lesson" ("id", "stageId", "title", "minutes", "published", "position", "goals") VALUES
                    (1, 1, 'one', 1, true, 0, '{}'), (2, 1, 'hidden', 1, false, 1, '{}'), (3, 2, 'two', 1, true, 0, '{}'), (4, 4, 'four', 1, true, 0, '{}')`;
                await tx.$executeRaw`INSERT INTO "LessonProgress" ("userId", "lessonId", "best", "passed", "attempts") VALUES ('completed', 1, 100, true, 1)`;
                await tx.$executeRaw`INSERT INTO "LessonSession" ("userId", "lessonId") VALUES ('active', 3)`;
                await tx.$executeRawUnsafe(`DO $audit$ BEGIN\n${sql.at(-1)}\nEND $audit$`);
                const users = await tx.$queryRaw`SELECT "id", "unlockedStages", "passwordHash" FROM "User" ORDER BY "id"`;
                assert.deepEqual(users.map((u) => [u.id, u.unlockedStages]), [['active', [1, 2]], ['completed', [1, 2]], ['new', [1]]]);
                assert.ok(users.every((u) => u.passwordHash === 'fixture'));
                assert.equal((await tx.$queryRaw`SELECT COUNT(*)::int AS n FROM "LessonProgress"`)[0].n, 1);
                assert.equal((await tx.$queryRaw`SELECT COUNT(*)::int AS n FROM "LessonSession"`)[0].n, 1);
                // The previous application can still read all original columns after this additive migration.
                assert.equal((await tx.$queryRaw`SELECT "id", "email", "listenTotal" FROM "User"`).length, 3);
                throw rollback;
            }, { timeout: 30_000 });
        } catch (error) { if (error !== rollback) throw error; }
        assert.equal((await prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM information_schema.schemata WHERE schema_name = ${schema}`)[0].n, 0);
    });

    test('ARCH-01 counter expiration uses UTC even when a database session uses Vietnamese time', async () => {
        const prefix = `timezone-${crypto.randomUUID()}`;
        const before = Date.now();
        const result = await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SET LOCAL TIME ZONE 'Asia/Ho_Chi_Minh'`;
            const store = new PostgresRateLimitStore(prefix, tx);
            store.init({ windowMs: 60_000 });
            try { return await store.increment('fixture'); }
            finally { await store.resetKey('fixture'); }
        });
        assert.ok(result.resetTime.getTime() >= before + 59_000);
        assert.ok(result.resetTime.getTime() <= Date.now() + 61_000);
    });
    // This worker owns no persistent fixture rows after either test.
    const { after } = await import('node:test');
    after(() => prisma.$disconnect());
}
