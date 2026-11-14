/**
 * Mường ↔ Việt dictionary over the verified vocabulary and sentences only.
 * Nothing is translated or generated: a query either matches verified entries or returns nothing.
 *
 * Ranking (higher first): exact → starts with → whole word → contains, on the exact spelling;
 * then the same on the spelling without tone marks / diacritics ("gần đúng"), so "pon" finds "pổn"
 * but is flagged as an approximate match because the tone changes the meaning.
 */
const lower = (s) => String(s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
export const bareText = (s) => lower(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

function rank(field, q) {
    if (!field || !q) return 0;
    if (field === q) return 4;
    if (field.startsWith(q)) return 3;
    if (` ${field} `.includes(` ${q} `)) return 2;
    if (field.includes(q)) return 1;
    return 0;
}

/** 0 = no match; exact-spelling matches score 10+, approximate ones 1–4. */
function score(texts, q, qBare) {
    let best = 0;
    for (const t of texts) {
        const exact = rank(lower(t), q);
        if (exact) best = Math.max(best, 10 + exact);
        else best = Math.max(best, rank(bareText(t), qBare));
    }
    return best;
}

/**
 * @param {object} C   content (getContent)
 * @param {{ q?: string, dir?: 'all'|'mtq'|'vi', limit?: number, offset?: number }} opts
 */
export function searchDictionary(C, { q = '', dir = 'all', limit = 30, offset = 0 } = {}) {
    const lessons = new Map(C.STAGES.flatMap((s) => s.lessons).map((l) => [l.id, l]));
    const entries = [
        ...C.VOCABULARY.map((v) => ({ id: `word:${v.id}`, type: 'word', ref: v.id, text: v.word, meaning: v.meaning, topic: v.topic, note: v.note ?? null, pronunciation: v.pronunciation ?? null, dialect: v.dialect ?? null, source: v.source ?? null, audioUrl: v.audioUrl ?? null, lessonId: v.lessonId ?? null })),
        ...C.SENTENCES.map((s) => ({ id: `sentence:${s.id}`, type: 'sentence', ref: s.id, text: s.text, meaning: s.meaning, topic: s.topic, note: s.note ?? null, pronunciation: null, dialect: s.dialect ?? null, source: s.source ?? null, audioUrl: s.audioUrl ?? null, lessonId: s.lessonId ?? null })),
    ];
    const query = lower(q).replace(/[?!.,…]+$/u, '');
    const qBare = bareText(query);

    let hits;
    if (!query) {
        hits = entries.map((e) => ({ e, s: 0 })).sort((a, b) => a.e.type.localeCompare(b.e.type) * -1 || a.e.text.localeCompare(b.e.text, 'vi'));
    } else {
        hits = entries
            .map((e) => ({ e, s: score(dir === 'vi' ? [e.meaning] : dir === 'mtq' ? [e.text] : [e.text, e.meaning], query, qBare) }))
            .filter((h) => h.s > 0)
            .sort((a, b) => b.s - a.s || Number(b.e.type === 'word') - Number(a.e.type === 'word') || a.e.text.localeCompare(b.e.text, 'vi') || a.e.id.localeCompare(b.e.id));
    }

    const sentences = entries.filter((e) => e.type === 'sentence');
    const page = hits.slice(offset, offset + limit).map(({ e, s }) => {
        const wordBare = bareText(e.text);
        return {
            ...e,
            approximate: !!query && s < 10,
            lesson: e.lessonId && lessons.get(e.lessonId)?.published ? { id: e.lessonId, title: lessons.get(e.lessonId).title } : null,
            // verified sentences that use this word
            examples: e.type === 'word' ? sentences.filter((x) => ` ${bareText(x.text)} `.includes(` ${wordBare} `)).slice(0, 3).map((x) => ({ text: x.text, meaning: x.meaning })) : [],
        };
    });
    return { total: hits.length, items: page };
}
