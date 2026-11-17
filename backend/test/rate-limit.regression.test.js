import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import rateLimit from 'express-rate-limit';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/rate_test', JWT_SECRET: 'isolated-rate-limit-test-secret-over-32-characters' });
const { PostgresRateLimitStore } = await import('../src/middleware/rateLimitStore.js');
const { errorHandler } = await import('../src/middleware/errors.js');
const { apiLimiter, apiRateKey } = await import('../src/middleware/rateLimit.js');
const { signAccess, signReset } = await import('../src/lib/jwt.js');

test('ARCH-01 independent middleware instances share counters and reject concurrent excess requests', async (t) => {
    const counters = new Map();
    const db = { $queryRaw: async (_sql, key) => {
        const row = counters.get(key) ?? { hits: 0, resetAt: new Date(Date.now() + 60_000) };
        row.hits++;
        counters.set(key, row);
        return [{ ...row }];
    }, $executeRaw: async () => 0 };
    const stores = [new PostgresRateLimitStore('auth', db), new PostgresRateLimitStore('auth', db)];
    const servers = stores.map((store) => {
        const app = express();
        app.use(rateLimit({ store, windowMs: 60_000, limit: 3, standardHeaders: 'draft-7', legacyHeaders: false }));
        app.get('/', (_req, res) => res.json({ ok: true }));
        return app.listen(0, '127.0.0.1');
    });
    for (const server of servers) {
        if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
        t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
    }
    const statuses = await Promise.all(Array.from({ length: 8 }, (_, i) => fetch(`http://127.0.0.1:${servers[i % 2].address().port}/`).then((r) => r.status)));
    assert.equal(statuses.filter((s) => s === 200).length, 3);
    assert.equal(statuses.filter((s) => s === 429).length, 5);
    const key = [...counters.keys()][0];
    assert.match(key, /^[a-f0-9]{64}$/);
    assert.equal(stores[0].keyFor('127.0.0.1'), stores[1].keyFor('127.0.0.1'));
    assert.notEqual(key, new PostgresRateLimitStore('api', db).keyFor('127.0.0.1'));
});

test('ARCH-01 a store outage returns 503 and does not allow the protected handler', async (t) => {
    const db = { $queryRaw: async () => { throw new Error('private connection details'); } };
    const app = express();
    app.use(rateLimit({ store: new PostgresRateLimitStore('outage', db), limit: 3 }));
    app.get('/', () => assert.fail('must fail closed'));
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'rate-limit-unavailable');
});

test('30 signed-in learners on one IP each receive an independent API budget', async (t) => {
    const app = express();
    app.use(apiLimiter);
    app.get('/', (_req, res) => res.json({ ok: true }));
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
    const tokens = Array.from({ length: 30 }, (_, i) => signAccess({ id: `classroom-${i}`, passwordHash: 'test-hash' }, false));
    const base = `http://127.0.0.1:${server.address().port}/`;
    for (let poll = 0; poll < 12; poll++) {
        const responses = await Promise.all(tokens.map((token) => fetch(base, { headers: { Authorization: `Bearer ${token}` } })));
        assert.ok(responses.every((response) => response.status === 200));
    }
    let rejected = 0;
    for (let batch = 0; batch < 17; batch++) {
        const responses = await Promise.all(Array.from({ length: 18 }, () => fetch(base, { headers: { Authorization: `Bearer ${tokens[0]}` } })));
        rejected += responses.filter((response) => response.status === 429).length;
    }
    assert.equal(rejected, 18, 'one account still stops after its own 300 requests');
    assert.equal((await fetch(base, { headers: { Authorization: `Bearer ${tokens[1]}` } })).status, 200);
});

test('unverified token contents and reset tokens cannot create rate-limit identities', () => {
    const user = { id: 'real-user', email: 'user@test.local', passwordHash: 'fixture' };
    const req = (token) => ({ ip: '127.0.0.1', headers: { authorization: `Bearer ${token}` } });
    assert.equal(apiRateKey(req('forged.payload.signature')), 'ip:127.0.0.1');
    assert.equal(apiRateKey(req(signReset(user))), 'ip:127.0.0.1');
    assert.equal(apiRateKey(req(signAccess(user, false))), 'user:real-user');
});
