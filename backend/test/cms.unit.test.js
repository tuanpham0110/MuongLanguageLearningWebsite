import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit_test';
process.env.JWT_SECRET = 'isolated-test-secret-at-least-32-characters';

const { itemInput, toItemRow, vocabularyInput, mediaUrl } = await import('../src/modules/cms/schemas.js');
const { sniff } = await import('../src/modules/cms/media.routes.js');
const { searchDictionary } = await import('../src/modules/content/dictionary.js');
const { levelOf } = await import('../src/modules/learning/rules.js');
const { gradeResponse } = await import('../src/modules/learning/rules.js');

const ok = (v) => itemInput.safeParse(v);
const firstError = (v) => itemInput.safeParse(v).error?.issues[0]?.message;

test('dictionary equal-rank results use stable type and spelling order across pages', () => {
    const C = {
        STAGES: [],
        VOCABULARY: ['c', 'a', 'b'].map((id) => ({ id, word: `x ${id}`, meaning: 'same' })),
        SENTENCES: [{ id: 's', text: 'x a', meaning: 'same' }],
    };
    const all = searchDictionary(C, { q: 'x' }).items.map((e) => e.id);
    assert.deepEqual(all, ['word:a', 'word:b', 'word:c', 'sentence:s']);
    const pages = [0, 2].flatMap((offset) => searchDictionary(C, { q: 'x', limit: 2, offset }).items.map((e) => e.id));
    assert.deepEqual(pages, all);
});

test('exercise validation: the answer must be one of distinct options', () => {
    const base = { kind: 'listen-pick', audioText: 'A', options: ['A', 'B', 'C'], answer: 'A' };
    assert.equal(ok(base).success, true);
    assert.match(firstError({ ...base, answer: 'D' }), /một trong các lựa chọn/);
    assert.match(firstError({ ...base, options: ['A', ' a ', 'B'] }), /trùng/);
    assert.match(firstError({ ...base, options: ['A'] }), /ít nhất 2/);
    assert.match(firstError({ ...base, audioText: '   ' }), /Vui lòng nhập nội dung âm thanh/);
    assert.match(firstError({ kind: 'essay' }), /Dạng bài không hợp lệ/);
    assert.match(firstError({ ...base, imageUrl: 'javascript:alert(1)' }), /Đường dẫn tệp không hợp lệ/);
    assert.equal(ok({ ...base, imageUrl: '/api/media/abc123', audioUrl: '' }).success, true);
});

test('fill needs text around the blank; shadow needs sentence and meaning', () => {
    assert.match(firstError({ kind: 'fill', options: ['A', 'B'], answer: 'A' }), /trước hoặc sau ô trống/);
    assert.equal(ok({ kind: 'fill', before: 'X', options: ['A', 'B'], answer: 'B' }).success, true);
    assert.match(firstError({ kind: 'shadow', text: 'X' }), /nghĩa tiếng Việt/);
});

test('saved exercises can be graded by the existing grader; order pieces never reveal the answer', () => {
    const order = toItemRow(itemInput.parse({ kind: 'order', answer: ['một', 'hai', 'ba', 'bốn'] }), () => 0);
    assert.equal(order.part, 'build');
    assert.notDeepEqual(order.data.tokens, order.answer);
    assert.deepEqual([...order.data.tokens].sort(), [...order.answer].sort());
    assert.equal(gradeResponse({ kind: 'order', ...order.data, answer: order.answer }, ['một', 'hai', 'ba', 'bốn']), true);

    const pick = toItemRow(itemInput.parse({ kind: 'listen-meaning', audioText: 'x', options: ['A', 'B'], answer: 'B', explain: ' ', save: null }));
    assert.equal(pick.part, 'listen');
    assert.equal(pick.explain, null);
    assert.equal('save' in pick.data, false);
    assert.equal(gradeResponse({ kind: pick.kind, ...pick.data, answer: pick.answer }, 'b'), true);

    const shadow = toItemRow(itemInput.parse({ kind: 'shadow', text: 'X', meaning: 'Y' }));
    assert.equal(shadow.answer, undefined);
    assert.equal('tips' in shadow.data, false);
});

test('language data keeps empty optional fields empty and rejects bad links', () => {
    const v = vocabularyInput.parse({ word: ' x ', meaning: 'y', topic: 'z', pronunciation: '', source: '  Nguồn  ' });
    assert.deepEqual([v.word, v.pronunciation, v.source, v.lessonId], ['x', undefined, 'Nguồn', null]);
    assert.equal(mediaUrl.safeParse('http://insecure.example/a.mp3').success, false);
});

test('uploads are typed from their bytes, not their name', () => {
    const pad = (bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(16)]);
    assert.equal(sniff(pad([0x89, 0x50, 0x4e, 0x47]))?.mime, 'image/png');
    assert.equal(sniff(pad([0xff, 0xd8, 0xff]))?.mime, 'image/jpeg');
    assert.equal(sniff(Buffer.from('RIFF\0\0\0\0WAVEfmt     '))?.mime, 'audio/wav');
    assert.equal(sniff(Buffer.from('ID3\x04\0\0\0\0\0\0\0\0\0'))?.kind, 'audio');
    assert.equal(sniff(Buffer.from('<svg onload=alert(1)>      ')), null);
    assert.equal(sniff(Buffer.from('<!doctype html><script>')), null);
    assert.equal(sniff(Buffer.from('short')), null);
});

const C = {
    STAGES: [{ lessons: [{ id: 1, title: 'Bài một', published: true }, { id: 2, title: 'Nháp', published: false }] }],
    VOCABULARY: [
        { id: 'pon', word: 'pổn', meaning: 'bốn', topic: 'Số', lessonId: 1, pronunciation: null },
        { id: 'pa', word: 'pa', meaning: 'ba', topic: 'Số', lessonId: 2 },
        { id: 'cui', word: 'con cúi', meaning: 'con lợn', topic: 'Vật nuôi', lessonId: 1 },
    ],
    SENTENCES: [{ id: 's1', text: 'Nhà ja chiếm từ con cúi chẵng?', meaning: 'Nhà mày có con lợn không?', topic: 'Hỏi', lessonId: 1 }],
};

test('dictionary: exact spelling first, tone-less search is flagged approximate, both directions', () => {
    const exact = searchDictionary(C, { q: 'pổn' });
    assert.equal(exact.items[0].text, 'pổn');
    assert.equal(exact.items[0].approximate, false);
    assert.deepEqual(exact.items[0].lesson, { id: 1, title: 'Bài một' });

    const bare = searchDictionary(C, { q: 'pon' });
    assert.equal(bare.items[0].text, 'pổn');
    assert.equal(bare.items[0].approximate, true);

    const vi = searchDictionary(C, { q: 'con lợn', dir: 'vi' });
    assert.equal(vi.items[0].text, 'con cúi');
    assert.equal(vi.items[0].examples[0].text, 'Nhà ja chiếm từ con cúi chẵng?');
    // a Vietnamese meaning is not matched when searching Mường only
    assert.equal(searchDictionary(C, { q: 'bốn', dir: 'mtq' }).total, 0);
    // unpublished lessons are not linked
    assert.equal(searchDictionary(C, { q: 'pa', dir: 'mtq' }).items.find((e) => e.text === 'pa').lesson, null);
    // nothing is invented for unknown words
    assert.equal(searchDictionary(C, { q: 'xyzzy' }).total, 0);
    assert.equal(searchDictionary(C, {}).total, 4);
    assert.equal(searchDictionary(C, { limit: 2, offset: 2 }).items.length, 2);
});

test('levels need 100 XP more each time', () => {
    assert.deepEqual([0, 99, 100, 299, 300, 600, 1000].map((x) => levelOf(x).level), [1, 1, 2, 2, 3, 4, 5]);
    assert.deepEqual(levelOf(150), { level: 2, xp: 150, start: 100, next: 300, progress: 25 });
});
