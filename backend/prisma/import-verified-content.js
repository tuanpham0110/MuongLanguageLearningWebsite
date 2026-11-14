import { PACK_ID, sourceArticle, verifiedLessons, VERIFIED_SENTENCES } from './data/verified-content.js';

/** Append once, in one transaction. The source article is also the import receipt.
 * Existing lessons, administrator edits and learner history are never overwritten.
 */
export async function installVerifiedContent(db) {
    return db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(741920261115::bigint)`;
        if (await tx.handbookArticle.findUnique({ where: { id: PACK_ID } })) return { installed: false, pack: PACK_ID };
        const target = await tx.stage.findUnique({ where: { id: 2 } });
        if (!target) throw new Error('Chưa có chặng 2 để bổ sung học liệu. Hãy kiểm tra nội dung trước khi nhập.');

        const groups = verifiedLessons();
        const [{ _max: lessonMax }, { _max: lessonPosition }, { _max: wordPosition }, { _max: sentencePosition }, { _max: articlePosition }] = await Promise.all([
            tx.lesson.aggregate({ _max: { id: true } }),
            tx.lesson.aggregate({ where: { stageId: target.id }, _max: { position: true } }),
            tx.vocabulary.aggregate({ _max: { position: true } }),
            tx.sentence.aggregate({ _max: { position: true } }),
            tx.handbookArticle.aggregate({ _max: { position: true } }),
        ]);
        const words = [], sentences = [], items = new Map(), links = [], lessons = [];
        groups.forEach((group, i) => {
            const lessonId = (lessonMax.id ?? 0) + i + 1;
            lessons.push({ id: lessonId, stageId: target.id, title: group.title, minutes: group.minutes, published: true, position: (lessonPosition.position ?? -1) + i + 1, goals: group.goals });
            group.words.forEach(({ page, ...entry }) => words.push({ ...entry, topic: group.topic, lessonId, position: (wordPosition.position ?? -1) + words.length + 1 }));
            if (group.key === 'doc-cau') VERIFIED_SENTENCES.forEach(({ page, tokens, blank, ...entry }) => sentences.push({ ...entry, lessonId, position: (sentencePosition.position ?? -1) + sentences.length + 1 }));
            group.items.forEach(({ id, part, kind, answer, explain, translation, ...data }, position) => {
                items.set(id, { id, part, kind, answer, explain: explain ?? null, translation: translation ?? null, data });
                links.push({ lessonId, itemId: id, part, position });
            });
        });
        await tx.lesson.createMany({ data: lessons });
        await tx.vocabulary.createMany({ data: words });
        await tx.sentence.createMany({ data: sentences });
        await tx.item.createMany({ data: [...items.values()] });
        await tx.lessonItem.createMany({ data: links });
        await tx.handbookArticle.create({ data: { ...sourceArticle(), position: (articlePosition.position ?? -1) + 1 } });
        return { installed: true, pack: PACK_ID, lessons: lessons.length, words: words.length, sentences: sentences.length, exercises: items.size, lessonIds: lessons.map((l) => l.id) };
    }, { maxWait: 10_000, timeout: 30_000 });
}
