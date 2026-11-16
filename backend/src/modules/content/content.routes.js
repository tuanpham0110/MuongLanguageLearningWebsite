/**
 * Public, account-free endpoints: landing summary, vocabulary, handbook and the trial lesson.
 */
import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../../lib/http.js';
import { badRequest } from '../../lib/errors.js';
import { PART_ORDER, getContent } from './content.service.js';
import { searchDictionary } from './dictionary.js';
import { publicHandbook } from './public-resources.js';
import { gradeResponse, isGradable, lessonItemIds, publicItem, revealed } from '../learning/rules.js';

export const contentRoutes = Router();

contentRoutes.get(
    '/summary',
    ah(async (_req, res) => {
        const C = await getContent();
        res.json({
            stages: C.STAGES.map((s) => ({ id: s.id, code: s.code, tone: s.tone, title: s.title, summary: s.summary, lessons: s.lessons.length })),
            totalLessons: C.STAGES.reduce((n, s) => n + s.lessons.length, 0),
            vocabulary: C.VOCABULARY,
            threshold: C.PASS_THRESHOLD,
        });
    })
);

contentRoutes.get('/vocabulary', ah(async (_req, res) => res.json((await getContent()).VOCABULARY)));

/** Mường ↔ Việt lookup over verified entries only (see dictionary.js). */
contentRoutes.get(
    '/dictionary',
    ah(async (req, res) => {
        const q = parse(
            z.object({
                q: z.string().max(100, 'Từ khoá tối đa 100 ký tự.').optional().default(''),
                dir: z.enum(['all', 'mtq', 'vi']).optional().default('all'),
                limit: z.coerce.number().int().min(1).max(50).optional().default(30),
                offset: z.coerce.number().int().min(0).max(10_000).optional().default(0),
            }),
            req.query
        );
        res.json(searchDictionary(await getContent(), q));
    })
);

contentRoutes.get(
    '/handbook',
    ah(async (_req, res) => {
        const C = await getContent();
        res.json(publicHandbook(C));
    })
);

/* ───── Trial lesson (first published lesson, nothing is stored) ───── */
async function trialLesson() {
    const C = await getContent();
    const stage = C.STAGES[0];
    const lesson = stage?.lessons.find((l) => l.published);
    if (!lesson) throw badRequest('Chưa có bài học thử.');
    return { C, stage, lesson };
}

contentRoutes.get(
    '/trial',
    ah(async (_req, res) => {
        const { C, stage, lesson } = await trialLesson();
        res.json({
            lesson: { id: lesson.id, title: lesson.title, minutes: lesson.minutes, goals: lesson.goals },
            stage: { id: stage.id, title: stage.title, tone: stage.tone },
            parts: PART_ORDER.map((p) => ({ ...C.PARTS[p], items: (lesson.parts?.[p] ?? []).map((id) => publicItem(C, id)) })).filter((p) => p.items.length),
            session: { step: 0, answers: {}, shadow: {} },
            threshold: C.PASS_THRESHOLD,
            best: null,
        });
    })
);

contentRoutes.post(
    '/trial/answers',
    ah(async (req, res) => {
        const { itemId, response } = parse(
            z.object({ itemId: z.string().min(1).max(100), response: z.union([z.string().max(500), z.array(z.string().max(200)).max(30)]) }),
            req.body
        );
        const { C, lesson } = await trialLesson();
        const item = C.ITEMS[itemId];
        if (!item || !lessonItemIds(lesson).includes(itemId) || !isGradable(item)) throw badRequest('Câu hỏi không thuộc bài học thử.');
        res.json({ correct: gradeResponse(item, response), ...revealed(C, itemId) });
    })
);
