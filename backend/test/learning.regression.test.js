import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedLessons } from '../prisma/data/verified-content.js';

// This suite replaces every database method it uses and never reads backend/.env.
process.env.DATABASE_URL = 'postgresql://offline:offline@127.0.0.1:1/muonglab_test';
process.env.JWT_SECRET = 'offline-learning-test-key-not-a-real-secret-12345';
process.env.NODE_ENV = 'test';

const { prisma } = await import('../src/lib/prisma.js');
const { learningService } = await import('../src/modules/learning/learning.service.js');
const { reviewService } = await import('../src/modules/review/review.service.js');
const { invalidateContent } = await import('../src/modules/content/content.service.js');
const { CONTENT_VERSION, contentVersion } = await import('../src/modules/learning/session.js');
const { BADGES, decorateStages, gradeResponse, stageGates, statuses } = await import('../src/modules/learning/rules.js');
const { ITEMS, STAGES, VOCABULARY, SENTENCES, HANDBOOK } = await import('../prisma/data/content.js');
const { getContent } = await import('../src/modules/content/content.service.js');

const copy = (v) => structuredClone(v);
let db;
let content;
let mutex;
let locked;

function apply(target, data) {
    for (const [key, value] of Object.entries(data)) target[key] = value && typeof value === 'object' && 'increment' in value ? (target[key] || 0) + value.increment : copy(value);
    return copy(target);
}

beforeEach(() => {
    db = {
        user: { id: 'learner', dailyGoal: 10, reviewDone: 0, listenTotal: 0, listenCorrect: 0, buildTotal: 0, buildCorrect: 0, shadowPracticed: 0, shadowTotal: 0 },
        sessions: new Map(), progress: new Map(), attempts: [], cards: new Map(), daily: new Map(),
    };
    content = {
        stages: STAGES.map(({ lessons, ...s }, position) => ({ ...s, position })),
        lessons: STAGES.flatMap((s) => s.lessons.map(({ parts, ...l }, position) => ({ ...l, stageId: s.id, position, goals: l.goals || [] }))),
        links: STAGES.flatMap((s) => s.lessons.flatMap((l) => Object.entries(l.parts || {}).flatMap(([part, ids]) => ids.map((itemId, position) => ({ lessonId: l.id, itemId, part, position }))))),
        items: Object.entries(ITEMS).map(([id, { part, kind, answer, explain, translation, ...data }]) => ({ id, part, kind, answer, explain, translation, data })),
    };
    mutex = Promise.resolve();
    locked = false;
    prisma.stage.findMany = async () => copy(content.stages);
    prisma.lesson.findMany = async () => copy(content.lessons);
    prisma.lessonItem.findMany = async () => copy(content.links);
    prisma.item.findMany = async () => copy(content.items);
    prisma.vocabulary.findMany = async () => copy(VOCABULARY);
    prisma.sentence.findMany = async () => copy(SENTENCES);
    prisma.handbookArticle.findMany = async () => copy(HANDBOOK);
    prisma.user.findUniqueOrThrow = async () => copy(db.user);
    prisma.user.update = async ({ data }) => apply(db.user, data);
    prisma.lessonProgress.findMany = async () => [...db.progress.values()].map(copy);
    prisma.lessonProgress.upsert = async ({ where, create, update }) => {
        const key = where.userId_lessonId.lessonId;
        const row = db.progress.get(key);
        const next = row ? { ...row, ...copy(update) } : copy(create);
        db.progress.set(key, next);
        return copy(next);
    };
    prisma.lessonSession.findMany = async () => [...db.sessions.values()].map(copy);
    prisma.lessonSession.findUnique = async ({ where }) => {
        assert.equal(locked, true, 'session reads must happen after acquiring the learner lock');
        return copy(db.sessions.get(where.userId_lessonId.lessonId) || null);
    };
    prisma.lessonSession.upsert = async ({ where, create }) => {
        const key = where.userId_lessonId.lessonId;
        if (!db.sessions.has(key)) db.sessions.set(key, { step: 0, shadow: {}, startedAt: new Date(), updatedAt: new Date(), ...copy(create) });
        return copy(db.sessions.get(key));
    };
    prisma.lessonSession.update = async ({ where, data }) => apply(db.sessions.get(where.userId_lessonId.lessonId), data);
    prisma.lessonSession.updateMany = async ({ where, data }) => {
        if (!db.sessions.has(where.lessonId)) return { count: 0 };
        apply(db.sessions.get(where.lessonId), data);
        return { count: 1 };
    };
    prisma.lessonSession.delete = async ({ where }) => db.sessions.delete(where.userId_lessonId.lessonId);
    prisma.lessonSession.deleteMany = async ({ where }) => ({ count: Number(db.sessions.delete(where.lessonId)) });
    prisma.attempt.findMany = async ({ take }) => db.attempts.slice(0, take).map(copy);
    prisma.attempt.findFirst = async ({ where }) => copy(db.attempts.find((a) => a.score === where.score) || null);
    prisma.attempt.create = async ({ data }) => {
        const row = { id: `attempt-${db.attempts.length}`, ...copy(data) };
        db.attempts.unshift(row);
        return copy(row);
    };
    prisma.reviewCard.findMany = async ({ where }) => [...db.cards.values()].filter((c) => where.mastered === undefined || c.mastered === where.mastered).map(copy);
    prisma.reviewCard.findUnique = async ({ where }) => copy(db.cards.get(where.userId_itemId.itemId) || null);
    prisma.reviewCard.upsert = async ({ where, create, update }) => {
        const key = where.userId_itemId.itemId;
        const row = db.cards.get(key);
        if (row) return apply(row, update);
        db.cards.set(key, copy(create));
        return copy(create);
    };
    prisma.reviewCard.update = async ({ where, data }) => apply(db.cards.get(where.userId_itemId.itemId), data);
    prisma.dailyActivity.findMany = async () => [...db.daily.values()].map(copy);
    prisma.dailyActivity.upsert = async ({ where, create, update }) => {
        const key = where.userId_day.day;
        const row = db.daily.get(key);
        if (row) return apply(row, update);
        db.daily.set(key, copy(create));
        return copy(create);
    };
    prisma.notebookEntry.findMany = async () => [];
    prisma.supportMessage.count = async () => 0;
    prisma.$transaction = async (work) => {
        let release;
        const previous = mutex;
        let acquired = false;
        const transaction = new Proxy(prisma, { get(target, key) {
            if (key !== '$queryRaw') return target[key];
            return async (strings) => {
                assert.match(strings.join('?'), /FROM "User".*FOR UPDATE/);
                mutex = new Promise((r) => { release = r; });
                await previous;
                acquired = true;
                locked = true;
                return [{ id: 'learner' }];
            };
        } });
        try { return await work(transaction); }
        finally { if (acquired) { locked = false; release(); } }
    };
    invalidateContent();
});

test('BUG-002 concurrent different answers are preserved, same answer counts first try once', async () => {
    await learningService.startLesson('learner', 1);
    await Promise.all([
        learningService.answer('learner', 1, 'l1-ep-em', ITEMS['l1-ep-em'].answer),
        learningService.answer('learner', 1, 'l1-ep-minh', ITEMS['l1-ep-minh'].answer),
    ]);
    assert.equal(db.user.listenTotal, 2);
    assert.ok(db.sessions.get(1).answers['l1-ep-em']);
    assert.ok(db.sessions.get(1).answers['l1-ep-minh']);
    await Promise.all([
        learningService.answer('learner', 1, 'l1-mean-em', ITEMS['l1-mean-em'].answer),
        learningService.answer('learner', 1, 'l1-mean-em', ITEMS['l1-mean-em'].answer),
    ]);
    assert.equal(db.user.listenTotal, 3);
    assert.equal(db.user.listenCorrect, 3);
});

test('LOG-02 finish rejects incomplete work even at the pass threshold and ignores client step', async () => {
    const start = await learningService.startLesson('learner', 1);
    const graded = start.parts.flatMap((p) => p.items).filter((it) => it.part !== 'shadow');
    for (const it of graded.slice(0, Math.ceil(graded.length * 0.8))) {
        await learningService.answer('learner', 1, it.id, ITEMS[it.id].answer);
    }
    await learningService.saveStep('learner', 1, 9999);
    await assert.rejects(learningService.finishLesson('learner', 1), { status: 409, code: 'lesson-incomplete' });
    assert.equal(db.attempts.length, 0);
    assert.equal(db.progress.size, 0);
    assert.ok(db.sessions.has(1), 'incomplete work must remain resumable');
});

test('LOG-02 all graded answers and explicit shadow decisions are required, including optional skip', async () => {
    const start = await learningService.startLesson('learner', 1);
    for (const it of start.parts.flatMap((p) => p.items).filter((it) => it.part !== 'shadow')) {
        await learningService.answer('learner', 1, it.id, ITEMS[it.id].answer);
    }
    await assert.rejects(learningService.finishLesson('learner', 1), { code: 'lesson-incomplete' });
    for (const it of start.parts.flatMap((p) => p.items).filter((it) => it.part === 'shadow')) {
        await learningService.rateShadow('learner', 1, it.id, 'skip');
    }
    const result = await learningService.finishLesson('learner', 1);
    assert.equal(result.score, 100);
    assert.equal(result.passed, true);
    assert.equal(result.parts.shadow.practiced, 0);
});

test('LOG-01 a legitimately opened stage survives new lessons in previous stages and a restart', async () => {
    const stageId = content.stages[1].id;
    content.lessons.push({ id: 900, stageId, title: 'Later stage fixture', published: true, position: 0, goals: [], minutes: 1 });
    content.links.push({ lessonId: 900, itemId: 'l1-ep-em', part: 'listen', position: 0 });
    for (const l of content.lessons.filter((l) => l.stageId === content.stages[0].id && l.published)) {
        db.progress.set(l.id, { lessonId: l.id, best: 100, passed: true, attempts: 1 });
    }
    await learningService.startLesson('learner', 900);
    await learningService.restartLesson('learner', 900);
    content.lessons.push({ id: 901, stageId: content.stages[0].id, title: 'New prerequisite', published: true, position: -1, goals: [], minutes: 1 });
    content.links.push({ lessonId: 901, itemId: 'l1-ep-em', part: 'listen', position: 0 });
    invalidateContent();
    const resumed = await learningService.startLesson('learner', 900);
    assert.equal(resumed.lesson.id, 900);
    assert.ok(db.user.unlockedStages.includes(stageId));
    db.user.unlockedStages = [];
    db.progress.clear();
    db.sessions.clear();
    await assert.rejects(learningService.startLesson('learner', 900), { code: 'stage-locked' });
});

test('LOG-01 gates keep earned access, published lesson order, empty-stage gates and hidden lessons', () => {
    const C = { STAGES: [
        { id: 1, lessons: [{ id: 1, stageId: 1, published: true }] },
        { id: 2, lessons: [{ id: 2, stageId: 2, published: true }, { id: 3, stageId: 2, published: false }] },
        { id: 3, lessons: [] },
        { id: 4, lessons: [{ id: 4, stageId: 4, published: true }] },
    ] };
    const data = { lessons: {}, sessions: {}, unlockedStages: [1, 2] };
    assert.deepEqual(stageGates(C, data), { 1: true, 2: true, 3: false, 4: false });
    assert.deepEqual(statuses(C, data), { 1: 'current', 2: 'current', 3: 'soon', 4: 'locked' });
    data.lessons[2] = { passed: true };
    assert.equal(stageGates(C, data)[3], true);
    assert.equal(stageGates(C, data)[4], false, 'an empty stage remains a publication barrier');
});

test('PERF-01 journey operations do not load review, notebook, activity or unrelated history', async () => {
    for (const model of [prisma.reviewCard, prisma.notebookEntry, prisma.dailyActivity]) model.findMany = async () => assert.fail('unrelated data must not be loaded');
    prisma.attempt.findFirst = async () => assert.fail('perfect badge lookup is only needed for overview');
    await learningService.startLesson('learner', 1);
    await completePending();
    await learningService.stage('learner', 1);
    await learningService.finishLesson('learner', 1);
    assert.equal((await learningService.history('learner')).length, 1);
});

test('REVIEW-01 an early review token cannot be replayed within the same millisecond', async (t) => {
    const now = Date.now();
    t.mock.method(Date, 'now', () => now);
    db.cards.set('l1-ep-em', { userId: 'learner', itemId: 'l1-ep-em', part: 'listen', lessonId: 1, box: 2, right: 1, wrong: 0, mastered: false, lastCorrect: true, due: new Date(now + 1), addedAt: new Date(now - 1000), lastAt: new Date(now) });
    const [card] = await reviewService.queue('learner', { scope: 'all' });
    const result = await reviewService.answer('learner', card.itemId, ITEMS[card.itemId].answer, card.reviewToken);
    assert.equal(result.early, true);
    assert.equal(result.box, 2);
    assert.equal(result.due, now + 1);
    await assert.rejects(reviewService.answer('learner', card.itemId, ITEMS[card.itemId].answer, card.reviewToken), { code: 'review-stale' });
    assert.equal(db.user.reviewDone, 1);
});

test('BUG-003 content changes reject stale mutations, resume regrades first responses and prunes removed items', async () => {
    await learningService.startLesson('learner', 1);
    await learningService.answer('learner', 1, 'l1-ep-em', ITEMS['l1-ep-em'].answer);
    const oldVersion = db.sessions.get(1).answers[CONTENT_VERSION];
    content.items.find((it) => it.id === 'l1-ep-em').answer = 'different-answer';
    content.links = content.links.filter((link) => !(link.lessonId === 1 && link.itemId === 'l1-fill-em'));
    db.sessions.get(1).answers['l1-fill-em'] = { firstResponse: 'old', response: 'old', correct: true };
    invalidateContent();
    await assert.rejects(learningService.finishLesson('learner', 1), { code: 'content-changed' });
    const resumed = await learningService.startLesson('learner', 1);
    assert.equal(resumed.session.answers['l1-ep-em'].correct, false);
    assert.equal(resumed.session.answers['l1-fill-em'], undefined);
    assert.equal(resumed.session.answers[CONTENT_VERSION], undefined);
    assert.notEqual(db.sessions.get(1).answers[CONTENT_VERSION], oldVersion);
    assert.equal(db.attempts.length, 0);
});

test('BUG-003 legacy sessions are regraded and deleted lesson sessions do not break overview', async () => {
    db.sessions.set(1, { lessonId: 1, step: 1, answers: { 'l1-ep-em': { correct: true, response: 'wrong', firstResponse: 'wrong', attempts: 1 } }, shadow: {}, startedAt: new Date(), updatedAt: new Date() });
    const resumed = await learningService.startLesson('learner', 1);
    assert.equal(resumed.session.answers['l1-ep-em'].correct, false);
    content.lessons = content.lessons.filter((l) => l.id !== 1);
    invalidateContent();
    const overview = await learningService.overview('learner');
    assert.equal(overview.resume, null);
});

test('BUG-003 old tab content version is rejected after another tab adopts changed content', async () => {
    const old = await learningService.startLesson('learner', 1);
    assert.match(old.contentVersion, /^[a-f0-9]{64}$/);
    content.items.find((it) => it.id === 'l1-ep-em').answer = 'new-answer';
    invalidateContent();
    const fresh = await learningService.startLesson('learner', 1);
    assert.notEqual(fresh.contentVersion, old.contentVersion);
    await assert.rejects(learningService.answer('learner', 1, 'l1-ep-em', ITEMS['l1-ep-em'].answer, old.contentVersion), { code: 'content-changed' });
    await assert.rejects(learningService.rateShadow('learner', 1, 'l1-sh-em', 'good', old.contentVersion), { code: 'content-changed' });
    await assert.rejects(learningService.finishLesson('learner', 1, old.contentVersion), { code: 'content-changed' });
    assert.equal(db.attempts.length, 0);
    assert.equal(db.user.listenTotal, 0);
    const answer = await learningService.answer('learner', 1, 'l1-ep-em', 'new-answer', fresh.contentVersion);
    assert.equal(answer.correct, true);
});

test('BUG-003 unpublished lessons cannot be graded from an existing session', async () => {
    await learningService.startLesson('learner', 1);
    content.lessons.find((l) => l.id === 1).published = false;
    invalidateContent();
    await assert.rejects(learningService.answer('learner', 1, 'l1-ep-em', ITEMS['l1-ep-em'].answer), { status: 403 });
    await assert.rejects(learningService.finishLesson('learner', 1), { status: 403 });
    assert.equal(db.attempts.length, 0);
});

async function completePending(lessonId = 1) {
    const C = await getContent();
    const lesson = C.STAGES.flatMap((s) => s.lessons).find((l) => l.id === lessonId);
    for (const [part, ids] of Object.entries(lesson.parts || {})) for (const id of ids) {
        const session = db.sessions.get(lessonId);
        if (part === 'shadow' && !session.shadow[id]) await learningService.rateShadow('learner', lessonId, id, 'skip');
        else if (part !== 'shadow' && !session.answers[id]) await learningService.answer('learner', lessonId, id, 'wrong');
    }
}

test('first-try grading remains unchanged after retry, finish is serialized against duplicate finish', async () => {
    await learningService.startLesson('learner', 1);
    await learningService.answer('learner', 1, 'l1-ep-em', 'wrong');
    await learningService.answer('learner', 1, 'l1-ep-em', ITEMS['l1-ep-em'].answer);
    const resumed = await learningService.startLesson('learner', 1);
    assert.equal(resumed.session.answers['l1-ep-em'].correct, false);
    assert.equal(resumed.session.answers['l1-ep-em'].retryCorrect, true);
    await completePending();
    const results = await Promise.allSettled([learningService.finishLesson('learner', 1), learningService.finishLesson('learner', 1)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(db.attempts.length, 1);
    assert.equal(db.attempts[0].parts.listen.correct, 0);
    assert.ok(db.attempts[0].score >= 0 && db.attempts[0].score <= 100);
});

test('BUG-011 skip to good and rating edits keep totals, daily and lesson result in sync', async () => {
    await learningService.startLesson('learner', 1);
    await learningService.rateShadow('learner', 1, 'l1-sh-em', 'skip');
    await learningService.rateShadow('learner', 1, 'l1-sh-em', 'good');
    assert.equal(db.user.shadowTotal, 1);
    assert.equal(db.user.shadowPracticed, 1);
    assert.equal([...db.daily.values()][0].answered, 1);
    assert.equal([...db.daily.values()][0].correct, 1);
    await learningService.rateShadow('learner', 1, 'l1-sh-em', 'again');
    await learningService.rateShadow('learner', 1, 'l1-sh-em', 'again');
    assert.equal([...db.daily.values()][0].correct, 0);
    assert.equal(db.cards.get('l1-sh-em').wrong, 1);
    await learningService.rateShadow('learner', 1, 'l1-sh-em', 'good');
    await completePending();
    const result = await learningService.finishLesson('learner', 1);
    assert.equal(result.parts.shadow.practiced, db.user.shadowPracticed);
});

test('BUG-006 queue labels hide build answer and listen-pick target before submission', async () => {
    const now = new Date();
    for (const itemId of ['l4-order-sentence', 'l4-fill-concui', 'l1-ep-em']) db.cards.set(itemId, { userId: 'learner', itemId, part: ITEMS[itemId].part, lessonId: 1, box: 1, right: 0, wrong: 1, lastAt: now, addedAt: now, due: now, mastered: false, lastCorrect: false });
    const queue = await reviewService.queue('learner');
    assert.notEqual(queue.find((c) => c.itemId === 'l4-order-sentence').label, ITEMS['l4-order-sentence'].answer.join(' '));
    assert.ok(queue.find((c) => c.itemId === 'l4-fill-concui').label.includes('___'));
    assert.notEqual(queue.find((c) => c.itemId === 'l1-ep-em').label, ITEMS['l1-ep-em'].answer);
    assert.ok(queue.every((c) => c.item.answer === undefined));
});

test('BUG-012 duplicate review token cannot schedule twice, early review practises without moving the schedule', async () => {
    await learningService.startLesson('learner', 1);
    await learningService.answer('learner', 1, 'l1-ep-em', 'wrong');
    const [card] = await reviewService.queue('learner');
    const results = await Promise.allSettled([
        reviewService.answer('learner', card.itemId, ITEMS[card.itemId].answer, card.reviewToken),
        reviewService.answer('learner', card.itemId, ITEMS[card.itemId].answer, card.reviewToken),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'review-stale');
    assert.equal(db.user.reviewDone, 1);
    assert.equal(db.cards.get(card.itemId).box, 2);
    await assert.rejects(reviewService.answer('learner', card.itemId, ITEMS[card.itemId].answer), { code: 'review-stale' });
    // the card is now due tomorrow: answering it again today is practice, not a spaced recall
    const dueAfterFirst = new Date(db.cards.get(card.itemId).due).getTime();
    assert.ok(dueAfterFirst > Date.now());
    const [next] = await reviewService.queue('learner', { itemIds: [card.itemId] });
    const early = await reviewService.answer('learner', next.itemId, ITEMS[next.itemId].answer, next.reviewToken);
    assert.equal(early.early, true);
    assert.equal(db.cards.get(card.itemId).box, 2);
    assert.equal(new Date(db.cards.get(card.itemId).due).getTime(), dueAfterFirst);
    assert.equal(db.user.reviewDone, 2);
    // the early answer still used up its token, and a wrong early answer sends the card back to box 1
    await assert.rejects(reviewService.answer('learner', next.itemId, ITEMS[next.itemId].answer, next.reviewToken), { code: 'review-stale' });
    const [again] = await reviewService.queue('learner', { itemIds: [card.itemId] });
    const wrong = await reviewService.answer('learner', again.itemId, 'wrong', again.reviewToken);
    assert.equal(wrong.early, false);
    assert.equal(db.cards.get(card.itemId).box, 1);
});

test('BUG-012 a token cannot be used for another learner/card or changed signature', async () => {
    await learningService.startLesson('learner', 1);
    await learningService.answer('learner', 1, 'l1-ep-em', 'wrong');
    const [card] = await reviewService.queue('learner');
    await assert.rejects(reviewService.answer('other', card.itemId, 'wrong', card.reviewToken), { code: 'review-stale' });
    const parts = card.reviewToken.split('.');
    parts[2] = 'invalid';
    await assert.rejects(reviewService.answer('learner', card.itemId, 'wrong', parts.join('.')), { code: 'review-stale' });
    assert.equal(db.user.reviewDone, 0);
});

test('BUG-003 review tokens reject content changed after question presentation', async () => {
    await learningService.startLesson('learner', 1);
    await learningService.answer('learner', 1, 'l1-ep-em', 'wrong');
    const [card] = await reviewService.queue('learner');
    content.items.find((it) => it.id === card.itemId).answer = 'new-answer';
    invalidateContent();
    await assert.rejects(reviewService.answer('learner', card.itemId, ITEMS[card.itemId].answer, card.reviewToken), { code: 'review-stale' });
    assert.equal(db.user.reviewDone, 0);
});

test('BUG-013 completing every published lesson produces 100% while preserving planned totals', async () => {
    const C = await getContent();
    const state = { sessions: {}, lessons: Object.fromEntries([1, 2, 4, 5].map((id) => [id, { passed: true }])) };
    const [stage1, stage2] = decorateStages(C, state);
    assert.equal(stage1.percent, 100);
    assert.equal(stage1.total, 4);
    assert.equal(stage1.plannedTotal, 5);
    assert.equal(stage1.complete, true);
    assert.equal(stage2.unlocked, true);
});

test('BUG-016 a perfect attempt outside recent 100 still earns the badge', async () => {
    db.attempts = Array.from({ length: 101 }, (_, i) => ({ id: String(i), lessonId: 1, parts: {}, score: i === 100 ? 100 : 80, createdAt: new Date(), durationSec: 1 }));
    const overview = await learningService.overview('learner');
    assert.equal(overview.badges.find((b) => b.id === 'hoan-hao').earned, true);
    assert.equal(overview.recent.length, 5);
    assert.equal(BADGES.find((b) => b.id === 'hoan-hao').test({ hasPerfectAttempt: false, attempts: [] }), false);
});

test('Unicode grading preserves tone differences and accepts canonical equivalent text', () => {
    const item = ITEMS['l1-ep-em'];
    assert.equal(gradeResponse(item, `  ${item.answer.toUpperCase().normalize('NFD')}  `), true);
    assert.equal(gradeResponse(item, item.answer.normalize('NFD').replace(/[\u0300-\u036f]/g, '')), false);
});

test('sourced reading-only lesson unlocks after stage 1, carries attribution and can finish with 100%', async () => {
    const group = verifiedLessons()[0];
    const lessonId = 15;
    content.lessons.push({ id: lessonId, stageId: 2, position: 5, title: group.title, minutes: group.minutes, published: true, goals: group.goals });
    for (const [position, { id, part, kind, answer, explain, translation, ...data }] of group.items.entries()) {
        content.items.push({ id, part, kind, answer, explain, translation, data });
        content.links.push({ lessonId, itemId: id, part, position });
    }
    for (const id of [1, 2, 4, 5]) db.progress.set(id, { lessonId: id, best: 100, passed: true, attempts: 1 });
    invalidateContent();
    const start = await learningService.startLesson('learner', lessonId);
    assert.deepEqual(start.parts.map((p) => p.key), ['build']);
    assert.equal(start.lesson.references.length, 1);
    assert.match(start.lesson.references[0].dialect, /không tách riêng/);
    for (const item of group.items) {
        const response = await learningService.answer('learner', lessonId, item.id, item.answer, start.contentVersion);
        assert.equal(response.correct, true);
    }
    const finished = await learningService.finishLesson('learner', lessonId, start.contentVersion);
    assert.equal(finished.score, 100);
    assert.equal(finished.passed, true);
    assert.equal(finished.parts.listen.total, 0);
    assert.equal(finished.parts.build.total, group.items.length);
});
