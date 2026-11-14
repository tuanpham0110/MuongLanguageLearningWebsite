import test from 'node:test';
import assert from 'node:assert/strict';
import { PACK_ID, REFERENCE, sourceArticle, verifiedLessons, VERIFIED_SENTENCES, WORD_GROUPS } from '../prisma/data/verified-content.js';
import { installVerifiedContent } from '../prisma/import-verified-content.js';
import { itemInput, toItemRow, vocabularyInput, sentenceInput } from '../src/modules/cms/schemas.js';
import { lessonReferences } from '../src/modules/content/references.js';

test('verified pack has 7 usable lessons, 33 lexical pairs and only the 2 checked sentence examples', () => {
    const lessons = verifiedLessons();
    assert.equal(lessons.length, 7);
    const words = WORD_GROUPS.flatMap((g) => g.words);
    assert.equal(words.length, 33);
    assert.equal(new Set(words.map((w) => w.id)).size, words.length);
    assert.equal(VERIFIED_SENTENCES.length, 2);
    for (const group of WORD_GROUPS) for (const entry of group.words) {
        vocabularyInput.parse({ ...entry, topic: group.topic });
        assert.ok([111, 112, 113].includes(entry.page));
        assert.ok(entry.source.includes(REFERENCE.url));
        assert.match(entry.dialect, /không tách riêng/);
    }
    for (const entry of VERIFIED_SENTENCES) {
        sentenceInput.parse(entry);
        assert.equal(entry.tokens.join(' '), entry.text);
    }
    for (const lesson of lessons) {
        assert.ok(lesson.items.length > 0);
        assert.ok(lesson.goals.length <= 6);
        const ids = new Set();
        for (const item of lesson.items) {
            assert.equal(ids.has(item.id), false);
            ids.add(item.id);
            const row = toItemRow(itemInput.parse(item));
            assert.equal(row.part, 'build');
            assert.deepEqual(row.data.reference, item.reference);
            assert.equal(row.data.audioUrl, undefined);
            assert.equal(row.data.audioText, undefined);
            if (item.kind === 'fill') {
                assert.ok(item.options.includes(item.answer));
                assert.equal(new Set(item.options.map((s) => s.toLowerCase())).size, item.options.length);
            } else {
                assert.equal(item.kind, 'order');
                assert.notDeepEqual(item.tokens, item.answer);
                assert.equal(VERIFIED_SENTENCES.some((s) => s.text === item.answer.join(' ')), true);
            }
        }
    }
    assert.equal(new Set(lessons.flatMap((l) => l.items.map((i) => i.id))).size, 72);
});

test('bibliography discloses regional scope and separates a further-reading dataset from imported content', () => {
    const article = sourceArticle();
    assert.equal(article.id, PACK_ID);
    assert.match(JSON.stringify(article.body), /không xác định riêng thổ ngữ/);
    assert.match(JSON.stringify(article.body), /nguồn đọc thêm/i);
    const lessons = verifiedLessons();
    const C = { ITEMS: Object.fromEntries(lessons.flatMap((l) => l.items.map((i) => [i.id, i]))) };
    const sources = lessonReferences(C, { parts: { build: lessons[0].items.map((i) => i.id) } });
    assert.equal(sources.length, 1);
    assert.equal(sources[0].url, REFERENCE.url);
    assert.match(sources[0].locator, /111/);
    assert.match(sources[0].locator, /112/);
    assert.deepEqual(lessonReferences(C, {}), []);
});

test('citations survive CMS validation and reject executable or insecure links', () => {
    const item = verifiedLessons()[0].items[0];
    assert.equal(itemInput.safeParse(item).success, true);
    for (const url of ['javascript:alert(1)', 'data:text/html,hello', 'http://example.org/source', 'not-a-url']) {
        assert.equal(itemInput.safeParse({ ...item, reference: { ...REFERENCE, url } }).success, false);
    }
});

function mockDatabase({ installed = false, failItems = false } = {}) {
    let committed = { lessons: [{ id: 50, stageId: 2, position: 7, title: 'Admin edited lesson' }], vocabulary: [], sentence: [], item: [], lessonItem: [], handbookArticle: installed ? [{ id: PACK_ID }] : [] };
    return {
        rows: () => structuredClone(committed),
        async $transaction(work) {
            const rows = structuredClone(committed);
            const model = (name) => ({
                aggregate: async ({ _max }) => ({ _max: Object.fromEntries(Object.keys(_max).map((key) => [key, rows[name].length ? Math.max(...rows[name].map((r) => r[key] ?? -1)) : null])) }),
                createMany: async ({ data }) => {
                    if (name === 'item' && failItems) throw new Error('Duplicate item ID');
                    rows[name].push(...structuredClone(data));
                },
                create: async ({ data }) => rows[name].push(structuredClone(data)),
                findUnique: async ({ where }) => rows[name].find((r) => r.id === where.id) ?? null,
            });
            const tx = Object.fromEntries(Object.keys(rows).map((name) => [name, model(name)]));
            tx.lesson = model('lessons');
            tx.$executeRaw = async () => {};
            tx.stage = { findUnique: async () => ({ id: 2 }) };
            const result = await work(tx);
            committed = rows;
            return result;
        },
    };
}

test('import allocates new IDs, appends content and preserves administrator edits on every subsequent seed', async () => {
    const db = mockDatabase();
    const result = await installVerifiedContent(db);
    assert.equal(result.installed, true);
    assert.deepEqual(result.lessonIds, [51, 52, 53, 54, 55, 56, 57]);
    assert.equal(result.exercises, 72);
    let rows = db.rows();
    assert.equal(rows.lessons[0].title, 'Admin edited lesson');
    assert.equal(rows.lessons[1].position, 8);
    assert.equal(rows.vocabulary.length, 33);
    assert.equal(rows.sentence.length, 2);
    for (const link of rows.lessonItem) assert.ok(rows.item.some((item) => item.id === link.itemId));
    for (const entry of [...rows.vocabulary, ...rows.sentence]) assert.ok(result.lessonIds.includes(entry.lessonId));
    const before = db.rows();
    assert.equal((await installVerifiedContent(db)).installed, false);
    assert.deepEqual(db.rows(), before);
});

test('failed import rolls back all new lessons and does not leave a completion receipt', async () => {
    const db = mockDatabase({ failItems: true });
    const before = db.rows();
    await assert.rejects(installVerifiedContent(db), /Duplicate item ID/);
    assert.deepEqual(db.rows(), before);
});
