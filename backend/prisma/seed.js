/**
 * Seeds course content and the demo account.
 *   npm run db:seed
 *
 * Course content is managed in the admin area (Quản trị → Soạn bài) and lives in the database.
 * prisma/data/content.js is only the starting content: it is loaded when the database has no
 * content yet. Every deploy runs this script, so it must never overwrite what admins edited.
 *
 * To throw away the database content and reload content.js (learner progress is kept):
 *   SEED_CONTENT=replace npm run db:seed
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { HANDBOOK, ITEMS, SENTENCES, STAGES, VOCABULARY } from './data/content.js';

const prisma = new PrismaClient();
const PART_ORDER = ['listen', 'build', 'shadow'];

async function seedContent() {
    const items = Object.entries(ITEMS).map(([id, it]) => {
        const { part, kind, answer, explain, translation, ...data } = it;
        return { id, part, kind, data, answer: answer ?? undefined, explain: explain ?? null, translation: translation ?? null };
    });

    const stages = STAGES.map((s, i) => ({ id: s.id, code: s.code, tone: s.tone, title: s.title, summary: s.summary, position: i }));
    const lessons = STAGES.flatMap((s) =>
        s.lessons.map((l, i) => ({
            id: l.id,
            stageId: s.id,
            title: l.title,
            minutes: l.minutes,
            published: !!l.published,
            position: i,
            goals: l.goals ?? [],
        }))
    );
    const links = STAGES.flatMap((s) =>
        s.lessons.flatMap((l) =>
            PART_ORDER.flatMap((part) => (l.parts?.[part] ?? []).map((itemId, position) => ({ lessonId: l.id, itemId, part, position })))
        )
    );

    await prisma.$transaction([
        prisma.lessonItem.deleteMany(),
        prisma.item.deleteMany(),
        prisma.lesson.deleteMany(),
        prisma.stage.deleteMany(),
        prisma.vocabulary.deleteMany(),
        prisma.sentence.deleteMany(),
        prisma.handbookArticle.deleteMany(),
        prisma.stage.createMany({ data: stages }),
        prisma.lesson.createMany({ data: lessons }),
        prisma.item.createMany({ data: items }),
        prisma.lessonItem.createMany({ data: links }),
        prisma.vocabulary.createMany({
            data: VOCABULARY.map((v, i) => ({
                id: v.id, word: v.word, meaning: v.meaning, topic: v.topic, note: v.note ?? null, lessonId: v.lessonId ?? null, position: i,
                pronunciation: v.pronunciation ?? null, dialect: v.dialect ?? null, source: v.source ?? null, audioUrl: v.audioUrl ?? null,
            })),
        }),
        prisma.sentence.createMany({
            data: SENTENCES.map((s, i) => ({
                id: s.id, text: s.text, meaning: s.meaning, topic: s.topic, lessonId: s.lessonId ?? null, position: i,
                note: s.note ?? null, dialect: s.dialect ?? null, source: s.source ?? null, audioUrl: s.audioUrl ?? null,
            })),
        }),
        prisma.handbookArticle.createMany({
            data: HANDBOOK.map((a, i) => ({
                id: a.id,
                category: a.category,
                title: a.title,
                excerpt: a.excerpt,
                minutes: a.minutes,
                draft: !!a.draft,
                body: a.body ?? undefined,
                position: i,
            })),
        }),
    ]);
    console.log(`✓ Content: ${stages.length} stages, ${lessons.length} lessons, ${items.length} items, ${VOCABULARY.length} words, ${HANDBOOK.length} articles`);
}

async function seedDemoUser() {
    const email = 'demo@muonglab.vn';
    const passwordHash = await bcrypt.hash('muonglab123', 10);
    await prisma.user.upsert({
        where: { email },
        update: {},
        create: { email, name: 'Minh Anh', passwordHash, verified: true },
    });
    console.log(`✓ Demo account: ${email} / muonglab123`);
}

try {
    const existing = await prisma.stage.count();
    if (!existing) await seedContent();
    else if (process.env.SEED_CONTENT === 'replace') {
        console.warn('! SEED_CONTENT=replace: database content is replaced by prisma/data/content.js');
        await seedContent();
    } else console.log(`✓ Content: kept the ${existing} stages in the database (managed in Quản trị → Soạn bài)`);
    await seedDemoUser();
} catch (e) {
    console.error(e);
    process.exitCode = 1;
} finally {
    await prisma.$disconnect();
}
