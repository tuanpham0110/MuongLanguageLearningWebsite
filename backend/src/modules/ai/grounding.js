/** Bounded retrieval from existing course records; never invents language data or provenance. */
export function groundingRecords(C, { messages = [], context = {} } = {}, { maxEntries = 24, maxChars = 6000 } = {}) {
    const query = messages.filter((m) => m.role === 'user').slice(-3).map((m) => m.text).join(' ').normalize('NFC').toLowerCase();
    const terms = new Set(query.match(/[\p{L}\p{N}]+/gu) ?? []);
    const published = new Set(C.STAGES.flatMap((s) => s.lessons).filter((l) => l.published).map((l) => l.id));
    const entries = [...C.VOCABULARY.map((v) => ({ ...v, text: v.word })), ...C.SENTENCES];
    const ranked = entries.filter((v) => v.lessonId == null || published.has(v.lessonId)).map((v, index) => {
        const text = `${v.text} ${v.meaning} ${v.topic ?? ''}`.normalize('NFC').toLowerCase();
        const tokens = new Set(text.match(/[\p{L}\p{N}]+/gu) ?? []);
        const overlap = [...terms].filter((term) => tokens.has(term)).length;
        return { v, index, rank: (context.lessonId != null && context.lessonId === v.lessonId ? 100 : 0) + overlap };
    }).sort((a, b) => b.rank - a.rank || a.index - b.index);
    const records = [];
    let chars = 0;
    for (const { v } of ranked) {
        const line = JSON.stringify({
            text: String(v.text).slice(0, 300), meaning: String(v.meaning).slice(0, 300),
            source: v.source?.trim() ? v.source.trim().slice(0, 300) : 'Chưa có nguồn kiểm chứng được ghi trong học liệu',
            ...(v.dialect ? { dialect: v.dialect.slice(0, 160) } : {}),
        });
        if (chars + line.length + 1 > maxChars) continue;
        records.push(line);
        chars += line.length + 1;
        if (records.length >= maxEntries) break;
    }
    return records.join('\n');
}
