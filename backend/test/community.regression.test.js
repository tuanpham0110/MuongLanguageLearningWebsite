import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import nodemailer from 'nodemailer';

Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/community_test',
    JWT_SECRET: 'isolated-community-test-secret-at-least-32-characters',
    SMTP_HOST: 'smtp.example.test', SMTP_USER: 'test@example.test', SMTP_PASS: 'isolated-test-password',
});
let sentMail = 0;
nodemailer.createTransport = () => ({ sendMail: async () => { sentMail++; } });
const { createSupportService } = await import('../src/modules/support/support.service.js');
const { createCommunityService } = await import('../src/modules/community/community.service.js');
const { createCommunityRoutes, communityBody, communityQuery } = await import('../src/modules/community/community.routes.js');
const { unauthorized } = await import('../src/lib/errors.js');
const { errorHandler } = await import('../src/middleware/errors.js');
const { createMessageNotificationsService } = await import('../src/modules/messages/messages.service.js');

const learner = { id: 'learner', name: 'Người học', role: 'user', email: 'private@example.test' };
const another = { id: 'another', name: 'Bạn học', role: 'user', email: 'other@example.test' };
const admin = { id: 'admin', name: 'Quản trị', role: 'admin' };
const row = (index, at = 1000) => ({ id: `m${String(index).padStart(4, '0')}`, userId: learner.id, user: learner, body: `Tin ${index}`, createdAt: new Date(at), deletedAt: null });

function database(rows = []) {
    const states = new Map([learner, another, admin].map((user) => [user.id, { communityReadAt: null, communityReadId: null }]));
    const matches = (message, where) => {
        if (where.userId?.not === message.userId) return false;
        if (where.deletedAt === null && message.deletedAt !== null) return false;
        if (where.OR) return where.OR.some((condition) => {
            const at = condition.createdAt;
            if (at instanceof Date && message.createdAt.getTime() !== at.getTime()) return false;
            if (at?.lt && !(message.createdAt < at.lt)) return false;
            if (at?.gt && !(message.createdAt > at.gt)) return false;
            if (condition.id?.lt && !(message.id < condition.id.lt)) return false;
            if (condition.id?.gt && !(message.id > condition.id.gt)) return false;
            return true;
        });
        if (where.deletedAt?.gte) return message.deletedAt && message.deletedAt >= where.deletedAt.gte;
        return true;
    };
    return {
        user: {
            findUnique: async ({ where }) => states.get(where.id) ?? null,
            updateMany: async ({ where, data }) => {
                const state = states.get(where.id);
                if (state && (!state.communityReadAt || state.communityReadAt < data.communityReadAt || (+state.communityReadAt === +data.communityReadAt && state.communityReadId < data.communityReadId))) Object.assign(state, data);
                return { count: state ? 1 : 0 };
            },
        },
        communityMessage: {
            count: async ({ where }) => rows.filter((message) => matches(message, where)).length,
            findMany: async ({ where, orderBy, take, select }) => {
                let result = rows.filter((message) => matches(message, where));
                if (orderBy) result.sort((a, b) => (a.createdAt - b.createdAt || a.id.localeCompare(b.id)) * (orderBy[0].createdAt === 'desc' ? -1 : 1));
                result = result.slice(0, take);
                return result.map((message) => select ? { id: message.id } : { ...message });
            },
            findUnique: async ({ where }) => rows.find((message) => message.id === where.id) ?? null,
            create: async ({ data }) => {
                const message = { ...row(rows.length, Date.now()), ...data, user: [learner, another, admin].find((user) => user.id === data.userId) };
                rows.push(message);
                return message;
            },
            updateMany: async ({ where, data }) => {
                const message = rows.find((message) => message.id === where.id && message.deletedAt === null);
                if (message) Object.assign(message, data);
                return { count: message ? 1 : 0 };
            },
        },
    };
}

test('support stays unread in the admin inbox and sends no SMTP notification', async () => {
    const rows = [];
    const service = createSupportService({ supportMessage: {
        create: async ({ data }) => { const message = { ...data, id: 'support1', createdAt: new Date(), readAt: null }; rows.push(message); return message; },
        count: async ({ where }) => rows.filter((message) => message.fromAdmin === where.fromAdmin && message.readAt === where.readAt).length,
    } });
    await service.send(learner, 'Xin chào admin');
    await service.send(another, 'Mình cần hỗ trợ');
    assert.equal(await service.adminUnread(), 2);
    assert.equal(sentMail, 0);
});

test('chat history paginates equal timestamps without gaps or duplicates and hides email addresses', async () => {
    const rows = Array.from({ length: 123 }, (_, index) => row(index));
    const service = createCommunityService(database(rows));
    let page = await service.list();
    assert.equal(page.messages.length, 50);
    assert.equal(page.messages.at(-1).id, 'm0122');
    assert.deepEqual(Object.keys(page.messages[0].author).sort(), ['id', 'name', 'role']);
    const all = [...page.messages];
    while (page.nextBefore) {
        page = await service.list({ before: page.nextBefore });
        all.unshift(...page.messages);
    }
    assert.deepEqual(all.map((message) => message.id), rows.map((message) => message.id));
    // A deleted account may remove the cursor row; self-contained cursors still work.
    rows.splice(rows.findIndex((message) => message.id === 'm0073'), 1);
    assert.equal((await service.list({ before: '1000_m0073' })).messages.at(-1).id, 'm0072');
});

test('incremental chat catches up on more than one page of messages between polls', async () => {
    const rows = [row(0)];
    const service = createCommunityService(database(rows));
    const initial = await service.list();
    rows.push(...Array.from({ length: 125 }, (_, index) => row(index + 1, 2000)));
    let after = initial.latestCursor;
    const messages = [];
    do {
        const page = await service.list({ after });
        messages.push(...page.messages);
        after = page.nextAfter;
    } while (after);
    assert.equal(messages.length, 125);
    assert.equal(new Set(messages.map((message) => message.id)).size, 125);
    assert.deepEqual((await service.list({ after: '2000_m0125' })).messages, []);
});

test('an initially empty room keeps a cursor and catches every message in a burst', async () => {
    const rows = [];
    const service = createCommunityService(database(rows));
    const initial = await service.list();
    assert.deepEqual(initial.messages, []);
    assert.ok(initial.latestCursor);
    rows.push(...Array.from({ length: 60 }, (_, index) => row(index, initial.syncedAt + 1)));
    const first = await service.list({ after: initial.latestCursor });
    const rest = await service.list({ after: first.nextAfter });
    assert.equal(first.messages.length + rest.messages.length, 60);
});

test('only the sender or an admin can remove a message; deletion removes stored text and reaches older history', async () => {
    const rows = Array.from({ length: 60 }, (_, index) => row(index));
    const service = createCommunityService(database(rows));
    const since = Date.now();
    await assert.rejects(service.remove(another, 'm0000'), { status: 403 });
    assert.equal(rows[0].body, 'Tin 0');
    const deleted = await service.remove(admin, 'm0000');
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.body, '');
    assert.equal(rows[0].body, '');
    const page = await service.list({ since });
    assert.ok(!page.messages.some((message) => message.id === 'm0000'));
    assert.deepEqual(page.removedIds, ['m0000']);
    const old = await service.list({ before: page.nextBefore });
    assert.equal(old.messages[0].deleted, true);
    assert.equal(old.messages[0].body, '');
    assert.equal((await service.remove(learner, 'm0001')).deleted, true);
    assert.equal((await service.remove(admin, 'm0001')).deleted, true);
    await assert.rejects(service.remove(admin, 'missing'), { status: 404 });
});

test('community validation rejects blank, oversized and malformed requests', () => {
    assert.equal(communityBody.safeParse({ body: '  ' }).success, false);
    assert.equal(communityBody.safeParse({ body: 'x'.repeat(2001) }).success, false);
    assert.equal(communityBody.parse({ body: '  Xin chào  ', userId: 'admin' }).body, 'Xin chào');
    for (const query of [{ before: 'bad' }, { since: -1 }, { since: 'NaN' }, { since: '999999999999999999' }, { after: '1000_m1', before: '1000_m2' }]) assert.equal(communityQuery.safeParse(query).success, false);
});

test('unread is per account, excludes own/removed posts and persists across service instances', async () => {
    const rows = [row(0), row(1), { ...row(2), userId: another.id, user: another }, { ...row(3), deletedAt: new Date() }];
    const db = database(rows);
    const service = createCommunityService(db);
    assert.equal((await service.unread(another.id)).unread, 2);
    assert.equal((await service.list({}, another.id)).readState.unread, 2);
    assert.equal((await service.unread(another.id)).unread, 2, 'loading history must not mark messages read');
    assert.equal((await service.markRead(another.id, 'm0000')).unread, 1, 'equal timestamps still compare message IDs');
    assert.equal((await service.markRead(another.id, 'm0001')).unread, 0);
    rows.push(row(4, 2000));
    await service.markRead(another.id, 'm0000');
    assert.equal((await createCommunityService(db).unread(another.id)).unread, 1, 'a slower tab cannot roll back the read boundary');
    assert.equal((await service.unread(learner.id)).unread, 1, 'another account has an independent boundary');
    await service.remove(admin, 'm0004');
    assert.equal((await service.unread(another.id)).unread, 0);
    await assert.rejects(service.markRead(another.id, 'missing'), { status: 404 });
});

test('read acknowledgement cannot consume a message that arrived after the last displayed message', async () => {
    const rows = [row(0, 1000)];
    const service = createCommunityService(database(rows));
    const displayed = await service.list({}, another.id);
    rows.push(row(1, 1000), row(2, 2000));
    const state = await service.markRead(another.id, displayed.messages.at(-1).id);
    assert.equal(state.unread, 2);
});

test('notification summary separates room, private support and admin inbox without marking anything read', async () => {
    let adminCalls = 0;
    const service = createMessageNotificationsService({
        community: { unread: async (id) => { assert.equal(id, learner.id); return { unread: 3 }; } },
        support: { unread: async () => 2, adminUnread: async () => { adminCalls++; return 7; } },
    });
    assert.deepEqual(await service.unread(learner), { community: 3, support: 2, admin: 0, total: 5 });
    assert.equal(adminCalls, 0);
    assert.deepEqual(await service.unread({ ...learner, role: 'admin' }), { community: 3, support: 2, admin: 7, total: 12 });
});

test('community HTTP routes require authentication and use the authenticated sender', async (t) => {
    const service = createCommunityService(database());
    const app = express();
    app.use(express.json());
    app.use('/api/community', createCommunityRoutes({ service, authenticate: (req, _res, next) => {
        if (req.headers.authorization !== 'Bearer learner') return next(unauthorized());
        req.user = learner;
        next();
    }, limiter: (_req, _res, next) => next() }));
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
    const base = `http://127.0.0.1:${server.address().port}/api/community/messages`;
    const request = (method, path = '', body, authenticated = true) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: 'Bearer learner' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    assert.equal((await request('GET', '', undefined, false)).status, 401);
    assert.equal((await request('POST', '', { body: 'x' }, false)).status, 401);
    assert.equal((await request('DELETE', '/m1', undefined, false)).status, 401);
    assert.equal((await request('POST', '', { body: '  ' })).status, 400);
    assert.equal((await request('GET', '?before=invalid')).status, 400);
    const sent = await request('POST', '', { body: '  Xin chào  ', userId: admin.id, role: 'admin' });
    assert.equal(sent.status, 201);
    const message = await sent.json();
    assert.deepEqual(message.author, { id: learner.id, name: learner.name, role: 'user' });
    assert.equal(message.body, 'Xin chào');
    assert.equal('email' in message.author, false);
    const response = await request('GET');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await response.json()).messages[0].body, 'Xin chào');
    assert.equal((await request('DELETE', `/${message.id}`)).status, 200);
    assert.equal((await request('GET')).status, 200);
});

test('community send rate limit rejects bursts before creating excess messages', async (t) => {
    let saved = 0;
    const app = express();
    app.use(express.json());
    app.use('/messages', createCommunityRoutes({
        service: { send: async () => ({ id: String(++saved) }) },
        authenticate: (req, _res, next) => { req.user = { ...learner, id: 'rate-test-learner' }; next(); },
    }));
    app.use(errorHandler);
    const server = app.listen(0, '127.0.0.1');
    if (!server.listening) await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
    const responses = await Promise.all(Array.from({ length: 22 }, () => fetch(`http://127.0.0.1:${server.address().port}/messages/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: 'Xin chào' }),
    })));
    assert.equal(saved, 20);
    assert.equal(responses.filter((response) => response.status === 429).length, 2);
});
