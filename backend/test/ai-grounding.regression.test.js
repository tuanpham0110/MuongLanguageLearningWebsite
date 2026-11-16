import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groundingRecords } from '../src/modules/ai/grounding.js';

test('AI-03 thousands of records cannot grow grounding beyond its character/entry budgets', () => {
    const C = { STAGES: [{ lessons: [{ id: 1, published: true }, { id: 2, published: false }] }],
        VOCABULARY: Array.from({ length: 2000 }, (_, i) => ({ word: `fixture-${i}`, meaning: `test-meaning-${i}`, lessonId: 1, source: i ? undefined : 'Fixture source' })),
        SENTENCES: [{ text: 'DRAFT_ONLY_FIXTURE', meaning: 'draft', lessonId: 2 }],
    };
    const text = groundingRecords(C, { messages: [{ role: 'user', text: 'fixture-1999' }] });
    assert.ok(text.length <= 6000);
    assert.ok(text.split('\n').length <= 24);
    assert.doesNotMatch(text, /DRAFT_ONLY_FIXTURE/);
    assert.match(text, /Chưa có nguồn kiểm chứng/);
    assert.match(text, /fixture-1999/);
});

test('AI-03 current lesson takes priority and provenance/dialect are retained as data', () => {
    const C = { STAGES: [{ lessons: [{ id: 1, published: true }, { id: 2, published: true }] }],
        VOCABULARY: [{ word: 'other', meaning: 'other', lessonId: 1 }, { word: 'target', meaning: 'target', source: 'Recorded source', dialect: 'Recorded dialect', lessonId: 2 }], SENTENCES: [] };
    const record = JSON.parse(groundingRecords(C, { context: { lessonId: 2 } }, { maxEntries: 1 }));
    assert.equal(record.text, 'target');
    assert.equal(record.source, 'Recorded source');
    assert.equal(record.dialect, 'Recorded dialect');
});
