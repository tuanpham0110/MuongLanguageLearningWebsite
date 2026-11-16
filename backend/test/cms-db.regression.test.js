/**
 * Opt-in database E2E for content management and access control (RUN_DB_TESTS=true + TEST_DATABASE_URL ending in _test).
 *  - Flow 4: an admin creates a stage, a lesson, a word and exercises, publishes, and a learner studies it.
 *  - Flow 5: a learner cannot reach admin endpoints; drafts stay invisible to learners.
 * Fixture text is deliberately not Mường ("TEST-…"); everything created is removed afterwards.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function dedicatedTestDatabase(value) {
    try {
        const url = new URL(value);
        return ['postgres:', 'postgresql:'].includes(url.protocol) && /(?:^|[_-])test$/i.test(url.pathname.slice(1));
    } catch {
        return false;
    }
}

if (process.env.RUN_DB_TESTS !== 'true' || !dedicatedTestDatabase(process.env.TEST_DATABASE_URL)) {
    test('CMS database E2E requires explicit opt-in and a dedicated *_test DB', { skip: true }, () => {});
} else {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
    for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'GEMINI_API_KEY', 'SPEECH_API_URL', 'GOOGLE_CLIENT_ID', 'MICROSOFT_CLIENT_ID']) process.env[key] = '';
    const { createApp } = await import('../src/app.js');
    const { prisma } = await import('../src/lib/prisma.js');
    const { signAccess } = await import('../src/lib/jwt.js');

    const run = crypto.randomBytes(4).toString('hex');
    const created = { stages: [], lessons: [], items: [], words: [], media: [], users: [] };
    let server;
    let base;
    let adminToken;
    let learnerToken;

    async function api(method, path, body, token) {
        const res = await fetch(base + path, {
            method,
            headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        const type = res.headers.get('content-type') || '';
        return { status: res.status, data: type.includes('json') ? await res.json() : null, res };
    }

    before(async () => {
        server = createApp().listen(0);
        base = `http://127.0.0.1:${server.address().port}/api`;
        const admin = await prisma.user.create({ data: { email: `cms-admin-${run}@test.local`, name: 'CMS admin', passwordHash: 'x', verified: true, role: 'admin' } });
        const learner = await prisma.user.create({ data: { email: `cms-learner-${run}@test.local`, name: 'CMS learner', passwordHash: 'x', verified: true } });
        created.users.push(admin.id, learner.id);
        adminToken = signAccess(admin);
        learnerToken = signAccess(learner);
        // the learner has already passed every published lesson of stage 1
        const stage1 = await prisma.lesson.findMany({ where: { stageId: 1, published: true } });
        await prisma.lessonProgress.createMany({ data: stage1.map((l) => ({ userId: learner.id, lessonId: l.id, best: 100, passed: true, attempts: 1, lastAt: new Date() })) });
    });

    after(async () => {
        try {
            await prisma.user.deleteMany({ where: { id: { in: created.users } } });
            await prisma.lessonItem.deleteMany({ where: { lessonId: { in: created.lessons } } });
            await prisma.attempt.deleteMany({ where: { lessonId: { in: created.lessons } } });
            await prisma.lesson.deleteMany({ where: { id: { in: created.lessons } } });
            await prisma.item.deleteMany({ where: { id: { in: created.items } } });
            await prisma.vocabulary.deleteMany({ where: { id: { in: created.words } } });
            await prisma.media.deleteMany({ where: { id: { in: created.media } } });
            await prisma.stage.deleteMany({ where: { id: { in: created.stages } } });
        } finally {
            await prisma.$disconnect();
            server?.close();
        }
    });

    test('Flow 5: learners and guests cannot use the content management API', async () => {
        assert.equal((await api('GET', '/admin/cms')).status, 401);
        assert.equal((await api('GET', '/admin/cms', null, learnerToken)).status, 403);
        assert.equal((await api('POST', '/admin/cms/lessons', { stageId: 1, title: 'x', minutes: 5 }, learnerToken)).status, 403);
        assert.equal((await api('POST', '/admin/cms/lessons/1/publish', { published: false }, learnerToken)).status, 403);
        assert.equal((await api('PATCH', `/admin/users/${created.users[0]}`, { role: 'user' }, learnerToken)).status, 403);
        assert.equal((await api('GET', '/admin/content', null, learnerToken)).status, 403);
    });

    test('Flow 4: admin builds and publishes a lesson that a learner can then study', async () => {
        // stage (created and removed: it has no lessons, so deleting it is allowed)
        const stage = await api('POST', '/admin/cms/stages', { title: `TEST-stage-${run}`, summary: 'Fixture', tone: 'river' }, adminToken);
        assert.equal(stage.status, 201);
        created.stages.push(stage.data.id);

        // lesson at the end of stage 1, a word and three exercises
        const lesson = await api('POST', '/admin/cms/lessons', { stageId: 1, title: `TEST-lesson-${run}`, minutes: 5, goals: ['Fixture goal'] }, adminToken);
        assert.equal(lesson.status, 201);
        const lessonId = lesson.data.id;
        created.lessons.push(lessonId);
        assert.equal(lesson.data.published, false);

        const empty = await api('POST', `/admin/cms/lessons/${lessonId}/publish`, { published: true }, adminToken);
        assert.equal(empty.data.code, 'lesson-empty');

        const word = await api('POST', '/admin/cms/vocabulary', { word: `TEST-word-${run}`, meaning: `TEST-nghia-${run}`, topic: 'Fixture', lessonId, source: 'Test fixture', pronunciation: '' }, adminToken);
        assert.equal(word.status, 201);
        created.words.push(word.data.id);
        assert.equal(word.data.pronunciation, null);

        const bad = await api('POST', '/admin/cms/items', { kind: 'listen-meaning', audioText: 'a', options: ['A', 'B'], answer: 'C', lessonId }, adminToken);
        assert.equal(bad.status, 400);
        assert.equal(bad.data.field, 'answer');

        const items = [
            { kind: 'listen-meaning', audioText: `TEST-word-${run}`, options: [`TEST-nghia-${run}`, 'TEST-other'], answer: `TEST-nghia-${run}`, explain: 'Fixture', save: { type: 'word', ref: word.data.id } },
            { kind: 'order', answer: ['TEST-a', 'TEST-b', 'TEST-c'] },
            { kind: 'shadow', text: `TEST-word-${run}`, meaning: `TEST-nghia-${run}` },
        ];
        for (const it of items) {
            const r = await api('POST', '/admin/cms/items', { ...it, lessonId }, adminToken);
            assert.equal(r.status, 201, JSON.stringify(r.data));
            created.items.push(r.data.id);
        }

        // the draft is invisible to the learner, but the admin can preview and grade it
        const draft = await api('POST', `/me/lessons/${lessonId}/session`, null, learnerToken);
        assert.equal(draft.status, 403);
        assert.equal(draft.data.code, 'soon');
        const preview = await api('GET', `/admin/cms/lessons/${lessonId}/preview`, null, adminToken);
        assert.equal(preview.status, 200);
        assert.ok(preview.data.parts.flatMap((p) => p.items).every((i) => i.answer === undefined));
        const graded = await api('POST', `/admin/cms/lessons/${lessonId}/preview/answers`, { itemId: created.items[0], response: `TEST-nghia-${run}` }, adminToken);
        assert.equal(graded.data.correct, true);

        // publish → the learner sees it as the next lesson and can finish it
        assert.equal((await api('POST', `/admin/cms/lessons/${lessonId}/publish`, { published: true }, adminToken)).status, 200);
        const overview = await api('GET', '/me/overview', null, learnerToken);
        const mine = overview.data.stages[0].lessons.find((l) => l.id === lessonId);
        assert.equal(mine.status, 'current');

        const session = await api('POST', `/me/lessons/${lessonId}/session`, null, learnerToken);
        assert.equal(session.status, 200);
        const order = session.data.parts.flatMap((p) => p.items).find((i) => i.kind === 'order');
        assert.notDeepEqual(order.tokens, ['TEST-a', 'TEST-b', 'TEST-c']);
        const v = session.data.contentVersion;
        assert.equal((await api('POST', `/me/lessons/${lessonId}/session/answers`, { itemId: created.items[0], response: `TEST-nghia-${run}`, contentVersion: v }, learnerToken)).data.correct, true);
        assert.equal((await api('POST', `/me/lessons/${lessonId}/session/answers`, { itemId: created.items[1], response: ['TEST-a', 'TEST-b', 'TEST-c'], contentVersion: v }, learnerToken)).data.correct, true);
        assert.equal((await api('POST', `/me/lessons/${lessonId}/session/shadow`, { itemId: created.items[2], rating: 'skip', contentVersion: v }, learnerToken)).status, 200);
        const finish = await api('POST', `/me/lessons/${lessonId}/session/finish`, { contentVersion: v }, learnerToken);
        assert.equal(finish.data.score, 100);
        assert.equal(finish.data.passed, true);

        // the new word is in the dictionary with its source
        const dict = await api('GET', `/content/dictionary?q=${encodeURIComponent(`TEST-word-${run}`)}`);
        assert.equal(dict.data.items[0].source, 'Test fixture');
        assert.equal(dict.data.items[0].lesson.id, lessonId);

        // records protect the content: a word used by an exercise and a lesson with results cannot be deleted
        assert.equal((await api('DELETE', `/admin/cms/vocabulary/${word.data.id}`, null, adminToken)).data.code, 'in-use');
        assert.equal((await api('DELETE', `/admin/cms/lessons/${lessonId}`, null, adminToken)).data.code, 'lesson-published');
        assert.equal((await api('POST', `/admin/cms/lessons/${lessonId}/publish`, { published: false }, adminToken)).status, 200);
        assert.equal((await api('DELETE', `/admin/cms/lessons/${lessonId}`, null, adminToken)).data.code, 'lesson-has-results');
        assert.equal((await api('DELETE', `/admin/cms/items/${created.items[0]}`, null, adminToken)).data.code, 'item-in-use');

        assert.equal((await api('DELETE', `/admin/cms/stages/${stage.data.id}`, null, adminToken)).status, 200);
        created.stages.pop();
    });

    test('media: typed by content, served with ranges, unused files only can be deleted', async () => {
        const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(64)]);
        const upload = async (buf, name, type, token = adminToken) => {
            const form = new FormData();
            form.append('file', new Blob([buf], { type }), name);
            const res = await fetch(`${base}/admin/cms/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
            return { status: res.status, data: await res.json() };
        };
        assert.equal((await upload(png, 'x.png', 'image/png', learnerToken)).status, 403);
        assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'x.png', 'image/png')).data.code, 'media-type');
        const ok = await upload(png, 'ảnh thử.png', 'text/html');
        assert.equal(ok.status, 201);
        assert.equal(ok.data.mime, 'image/png');
        created.media.push(ok.data.id);

        const full = await fetch(`http://127.0.0.1:${server.address().port}${ok.data.url}`);
        assert.equal(full.headers.get('content-type'), 'image/png');
        assert.equal(full.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await full.arrayBuffer()), png);
        const part = await fetch(`http://127.0.0.1:${server.address().port}${ok.data.url}`, { headers: { Range: 'bytes=0-3' } });
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('content-range'), `bytes 0-3/${png.length}`);

        const vocab = await api('POST', '/admin/cms/vocabulary', { word: `TEST-media-${run}`, meaning: 'x', topic: 'Fixture', audioUrl: ok.data.url }, adminToken);
        created.words.push(vocab.data.id);
        assert.equal((await api('DELETE', `/admin/cms/media/${ok.data.id}`, null, adminToken)).data.code, 'media-in-use');
        assert.equal((await api('DELETE', `/admin/cms/vocabulary/${vocab.data.id}`, null, adminToken)).status, 200);
        assert.equal((await api('DELETE', `/admin/cms/media/${ok.data.id}`, null, adminToken)).status, 200);
    });

    test('signing out other devices revokes old tokens and keeps this one', async () => {
        const user = await prisma.user.create({ data: { email: `cms-sessions-${run}@test.local`, name: 'Sessions', passwordHash: 'x', verified: true } });
        created.users.push(user.id);
        const other = signAccess(user);
        const mine = signAccess(user);
        const r = await api('POST', '/auth/sessions/revoke-others', null, mine);
        assert.equal(r.status, 200);
        assert.equal((await api('GET', '/auth/me', null, other)).status, 401);
        assert.equal((await api('GET', '/auth/me', null, r.data.token)).status, 200);
    });
}
