/**
 * Content management (Quản trị → Soạn bài). Mounted under /api/admin, so every route already
 * requires a signed-in admin. Content lives in the database; prisma/data/content.js only seeds an
 * empty database (see prisma/seed.js).
 *
 * Integrity rules enforced here:
 *  - every exercise is validated for its kind (schemas.js) – a published lesson can always be graded,
 *  - a lesson can be published only with at least one exercise,
 *  - nothing a learner has a record of is hard-deleted: lessons with attempts, exercises used in a
 *    lesson and words referenced by exercises must be unpublished / detached first.
 * Learners with an open session on a changed lesson are asked to reopen it (content version check).
 */
import crypto from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { ah, parse } from '../../lib/http.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { PART_ORDER, PARTS, freshContent, invalidateContent } from '../content/content.service.js';
import { gradeResponse, isGradable, lessonItemIds, publicItem, revealed } from '../learning/rules.js';
import { PART_OF_KIND, itemInput, lessonInput, lessonItemsInput, sentenceInput, stageInput, toItemRow, vocabularyInput } from './schemas.js';
import { mediaRoutes } from './media.routes.js';
import { lessonReferences } from '../content/references.js';

export const cmsRoutes = Router();
cmsRoutes.use('/media', mediaRoutes);

const intId = z.coerce.number().int().positive();
const strId = z.string().regex(/^[\w-]{1,100}$/, 'Mã không hợp lệ.');
const newId = (prefix) => `${prefix}-${crypto.randomBytes(5).toString('hex')}`;

/** Every content write: drop this instance's cache and leave a trace of who changed what. */
function changed(req, what) {
    invalidateContent();
    logger.info(`[cms] ${req.user.email} ${what}`);
}

async function nextInt(model) {
    const { _max } = await model.aggregate({ _max: { id: true } });
    return (_max.id ?? 0) + 1;
}

/* ───────────── Read everything (drafts and answers included) ───────────── */
cmsRoutes.get(
    '/',
    ah(async (_req, res) => {
        const [stages, lessons, links, items, vocabulary, sentences, attempts] = await Promise.all([
            prisma.stage.findMany({ orderBy: { position: 'asc' } }),
            prisma.lesson.findMany({ orderBy: [{ stageId: 'asc' }, { position: 'asc' }] }),
            prisma.lessonItem.findMany({ orderBy: [{ lessonId: 'asc' }, { position: 'asc' }] }),
            prisma.item.findMany({ orderBy: { id: 'asc' } }),
            prisma.vocabulary.findMany({ orderBy: { position: 'asc' } }),
            prisma.sentence.findMany({ orderBy: { position: 'asc' } }),
            prisma.attempt.groupBy({ by: ['lessonId'], _count: { _all: true } }),
        ]);
        const A = new Map(attempts.map((a) => [a.lessonId, a._count._all]));
        const parts = {};
        const usedIn = {};
        for (const l of links) {
            parts[l.lessonId] ??= { listen: [], build: [], shadow: [] };
            parts[l.lessonId][l.part].push(l.itemId);
            (usedIn[l.itemId] ??= []).push(l.lessonId);
        }
        res.json({
            threshold: env.PASS_THRESHOLD,
            parts: PARTS,
            stages: stages.map((s) => ({
                ...s,
                lessons: lessons
                    .filter((l) => l.stageId === s.id)
                    .map((l) => ({ ...l, parts: parts[l.id] ?? { listen: [], build: [], shadow: [] }, attempts: A.get(l.id) ?? 0 })),
            })),
            items: items.map((it) => ({ id: it.id, part: it.part, kind: it.kind, ...it.data, answer: it.answer, explain: it.explain, translation: it.translation, usedIn: usedIn[it.id] ?? [] })),
            vocabulary,
            sentences,
        });
    })
);

/* ───────────── Stages ───────────── */
cmsRoutes.post(
    '/stages',
    ah(async (req, res) => {
        const b = parse(stageInput, req.body);
        const id = await nextInt(prisma.stage);
        const { _max } = await prisma.stage.aggregate({ _max: { position: true } });
        const stage = await prisma.stage.create({ data: { id, title: b.title, summary: b.summary, tone: b.tone, code: b.code ?? String(id).padStart(2, '0'), position: (_max.position ?? -1) + 1 } });
        changed(req, `created stage ${id}`);
        res.status(201).json(stage);
    })
);

cmsRoutes.patch(
    '/stages/:id',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const b = parse(stageInput.partial(), req.body);
        if (!(await prisma.stage.count({ where: { id } }))) throw notFound('Không tìm thấy chặng.');
        const stage = await prisma.stage.update({ where: { id }, data: Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)) });
        changed(req, `updated stage ${id}`);
        res.json(stage);
    })
);

cmsRoutes.delete(
    '/stages/:id',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        if (!(await prisma.stage.count({ where: { id } }))) throw notFound('Không tìm thấy chặng.');
        if (await prisma.lesson.count({ where: { stageId: id } })) throw conflict('Chặng còn bài học. Hãy xoá hoặc chuyển các bài sang chặng khác trước.', { code: 'stage-not-empty' });
        await prisma.stage.delete({ where: { id } });
        changed(req, `deleted stage ${id}`);
        res.json({ ok: true });
    })
);

/* ───────────── Lessons ───────────── */
async function assertStage(stageId) {
    if (!(await prisma.stage.count({ where: { id: stageId } }))) throw badRequest('Chặng không tồn tại.', { field: 'stageId' });
}

cmsRoutes.post(
    '/lessons',
    ah(async (req, res) => {
        const b = parse(lessonInput, req.body);
        await assertStage(b.stageId);
        const id = await nextInt(prisma.lesson);
        const { _max } = await prisma.lesson.aggregate({ where: { stageId: b.stageId }, _max: { position: true } });
        const lesson = await prisma.lesson.create({ data: { id, stageId: b.stageId, title: b.title, minutes: b.minutes, goals: b.goals, published: false, position: (_max.position ?? -1) + 1 } });
        changed(req, `created lesson ${id}`);
        res.status(201).json(lesson);
    })
);

cmsRoutes.patch(
    '/lessons/:id',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const b = parse(lessonInput.partial(), req.body);
        const current = await prisma.lesson.findUnique({ where: { id } });
        if (!current) throw notFound('Không tìm thấy bài học.');
        const data = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
        if (data.stageId && data.stageId !== current.stageId) {
            await assertStage(data.stageId);
            const { _max } = await prisma.lesson.aggregate({ where: { stageId: data.stageId }, _max: { position: true } });
            data.position = (_max.position ?? -1) + 1;
        }
        const lesson = await prisma.lesson.update({ where: { id }, data });
        changed(req, `updated lesson ${id}`);
        res.json(lesson);
    })
);

/** Moves a lesson one place up / down inside its stage. */
cmsRoutes.post(
    '/lessons/:id/move',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const { dir } = parse(z.object({ dir: z.union([z.literal(-1), z.literal(1)]) }), req.body);
        await prisma.$transaction(async (tx) => {
            const current = await tx.lesson.findUnique({ where: { id } });
            if (!current) throw notFound('Không tìm thấy bài học.');
            const siblings = await tx.lesson.findMany({ where: { stageId: current.stageId }, orderBy: { position: 'asc' } });
            const i = siblings.findIndex((l) => l.id === id);
            const j = i + dir;
            if (j < 0 || j >= siblings.length) return;
            const order = [...siblings];
            [order[i], order[j]] = [order[j], order[i]];
            for (const [position, l] of order.entries()) await tx.lesson.update({ where: { id: l.id }, data: { position } });
        });
        changed(req, `moved lesson ${id} ${dir > 0 ? 'down' : 'up'}`);
        res.json({ ok: true });
    })
);

cmsRoutes.post(
    '/lessons/:id/publish',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const { published } = parse(z.object({ published: z.boolean() }), req.body);
        const lesson = await prisma.lesson.findUnique({ where: { id } });
        if (!lesson) throw notFound('Không tìm thấy bài học.');
        if (published && !(await prisma.lessonItem.count({ where: { lessonId: id } }))) {
            throw badRequest('Bài học cần ít nhất một câu bài tập trước khi xuất bản.', { code: 'lesson-empty' });
        }
        await prisma.lesson.update({ where: { id }, data: { published } });
        changed(req, `${published ? 'published' : 'unpublished'} lesson ${id}`);
        res.json({ id, published });
    })
);

/** Sets which exercises a lesson contains, per part, in order. */
cmsRoutes.put(
    '/lessons/:id/items',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const parts = parse(lessonItemsInput, req.body);
        const all = PART_ORDER.flatMap((p) => parts[p]);
        if (new Set(all).size !== all.length) throw badRequest('Một câu chỉ được dùng một lần trong bài.', { code: 'duplicate-item' });
        const lesson = await prisma.lesson.findUnique({ where: { id } });
        if (!lesson) throw notFound('Không tìm thấy bài học.');
        if (lesson.published && !all.length) throw badRequest('Bài đã xuất bản phải còn ít nhất một câu. Hãy ẩn bài trước.', { code: 'lesson-empty' });
        const items = await prisma.item.findMany({ where: { id: { in: all } }, select: { id: true, part: true } });
        const P = new Map(items.map((i) => [i.id, i.part]));
        for (const p of PART_ORDER) {
            for (const itemId of parts[p]) {
                if (!P.has(itemId)) throw badRequest(`Không tìm thấy câu ${itemId}.`, { code: 'item-missing' });
                if (P.get(itemId) !== p) throw badRequest(`Câu ${itemId} không thuộc phần ${PARTS[p].title}.`, { code: 'item-part' });
            }
        }
        await prisma.$transaction([
            prisma.lessonItem.deleteMany({ where: { lessonId: id } }),
            prisma.lessonItem.createMany({ data: PART_ORDER.flatMap((part) => parts[part].map((itemId, position) => ({ lessonId: id, itemId, part, position }))) }),
        ]);
        changed(req, `set items of lesson ${id}`);
        res.json({ id, parts });
    })
);

cmsRoutes.delete(
    '/lessons/:id',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const lesson = await prisma.lesson.findUnique({ where: { id } });
        if (!lesson) throw notFound('Không tìm thấy bài học.');
        if (lesson.published) throw conflict('Hãy ẩn bài học (bỏ xuất bản) trước khi xoá.', { code: 'lesson-published' });
        const [attempts, progress] = await Promise.all([prisma.attempt.count({ where: { lessonId: id } }), prisma.lessonProgress.count({ where: { lessonId: id } })]);
        if (attempts || progress) throw conflict('Đã có người học làm bài này nên không thể xoá. Hãy giữ bài ở trạng thái ẩn.', { code: 'lesson-has-results' });
        await prisma.$transaction([
            prisma.lessonSession.deleteMany({ where: { lessonId: id } }),
            prisma.vocabulary.updateMany({ where: { lessonId: id }, data: { lessonId: null } }),
            prisma.sentence.updateMany({ where: { lessonId: id }, data: { lessonId: null } }),
            prisma.lesson.delete({ where: { id } }),
        ]);
        changed(req, `deleted lesson ${id}`);
        res.json({ ok: true });
    })
);

/* ───────────── Exercises ───────────── */
async function assertSaveRef(save) {
    if (!save) return;
    const exists = save.type === 'word' ? await prisma.vocabulary.count({ where: { id: save.ref } }) : await prisma.sentence.count({ where: { id: save.ref } });
    if (!exists) throw badRequest('Từ/câu gắn với nút "Lưu vào sổ tay" không tồn tại.', { field: 'save' });
}

cmsRoutes.post(
    '/items',
    ah(async (req, res) => {
        const input = parse(itemInput, req.body);
        const lessonId = req.body?.lessonId == null ? null : parse(intId, req.body.lessonId);
        await assertSaveRef(input.save);
        const row = toItemRow(input);
        const id = newId(lessonId ? `l${lessonId}` : 'item');
        await prisma.$transaction(async (tx) => {
            if (lessonId && !(await tx.lesson.count({ where: { id: lessonId } }))) throw notFound('Không tìm thấy bài học.');
            await tx.item.create({ data: { id, ...row } });
            if (lessonId) {
                const { _max } = await tx.lessonItem.aggregate({ where: { lessonId, part: row.part }, _max: { position: true } });
                await tx.lessonItem.create({ data: { lessonId, itemId: id, part: row.part, position: (_max.position ?? -1) + 1 } });
            }
        });
        changed(req, `created item ${id}${lessonId ? ` in lesson ${lessonId}` : ''}`);
        res.status(201).json({ id, ...row });
    })
);

cmsRoutes.put(
    '/items/:id',
    ah(async (req, res) => {
        const id = parse(strId, req.params.id);
        const input = parse(itemInput, req.body);
        const current = await prisma.item.findUnique({ where: { id } });
        if (!current) throw notFound('Không tìm thấy câu bài tập.');
        const row = toItemRow(input);
        if (row.part !== current.part && (await prisma.lessonItem.count({ where: { itemId: id } }))) {
            throw badRequest('Câu đang nằm trong bài học nên không thể đổi sang phần khác. Hãy tạo câu mới.', { field: 'kind' });
        }
        await assertSaveRef(input.save);
        // keep the learner-facing order of an unchanged order exercise
        if (row.kind === 'order' && current.kind === 'order' && JSON.stringify(current.answer) === JSON.stringify(row.answer)) row.data.tokens = current.data.tokens;
        await prisma.item.update({ where: { id }, data: { ...row, answer: row.answer ?? Prisma.DbNull } });
        changed(req, `updated item ${id}`);
        res.json({ id, ...row });
    })
);

cmsRoutes.delete(
    '/items/:id',
    ah(async (req, res) => {
        const id = parse(strId, req.params.id);
        if (!(await prisma.item.count({ where: { id } }))) throw notFound('Không tìm thấy câu bài tập.');
        const used = await prisma.lessonItem.findMany({ where: { itemId: id }, select: { lessonId: true } });
        if (used.length) throw conflict(`Câu đang dùng trong bài ${used.map((u) => u.lessonId).join(', ')}. Hãy gỡ khỏi bài trước khi xoá.`, { code: 'item-in-use' });
        await prisma.item.delete({ where: { id } });
        changed(req, `deleted item ${id}`);
        res.json({ ok: true });
    })
);

/* ───────────── Vocabulary & sentences ───────────── */
async function assertLesson(lessonId) {
    if (lessonId != null && !(await prisma.lesson.count({ where: { id: lessonId } }))) throw badRequest('Bài học không tồn tại.', { field: 'lessonId' });
}

/** Exercises whose "Lưu vào sổ tay" button points at this entry. */
async function itemsSaving(type, ref) {
    const items = await prisma.item.findMany({ select: { id: true, data: true } });
    return items.filter((i) => i.data?.save?.type === type && i.data?.save?.ref === ref).map((i) => i.id);
}

function langRoutes(path, model, schema, type, label) {
    const clean = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v === undefined ? null : v]));
    cmsRoutes.post(
        path,
        ah(async (req, res) => {
            const b = parse(schema, req.body);
            await assertLesson(b.lessonId);
            const { _max } = await model.aggregate({ _max: { position: true } });
            const row = await model.create({ data: { id: newId(type === 'word' ? 'w' : 's'), ...clean(b), position: (_max.position ?? -1) + 1 } });
            changed(req, `created ${type} ${row.id}`);
            res.status(201).json(row);
        })
    );
    cmsRoutes.put(
        `${path}/:id`,
        ah(async (req, res) => {
            const id = parse(strId, req.params.id);
            const b = parse(schema, req.body);
            if (!(await model.count({ where: { id } }))) throw notFound(`Không tìm thấy ${label}.`);
            await assertLesson(b.lessonId);
            const row = await model.update({ where: { id }, data: clean(b) });
            changed(req, `updated ${type} ${id}`);
            res.json(row);
        })
    );
    cmsRoutes.delete(
        `${path}/:id`,
        ah(async (req, res) => {
            const id = parse(strId, req.params.id);
            if (!(await model.count({ where: { id } }))) throw notFound(`Không tìm thấy ${label}.`);
            const refs = await itemsSaving(type, id);
            if (refs.length) throw conflict(`Các câu bài tập ${refs.join(', ')} đang trỏ tới ${label} này. Hãy sửa các câu đó trước.`, { code: 'in-use' });
            await prisma.$transaction([prisma.notebookEntry.deleteMany({ where: { entryId: `${type}:${id}` } }), model.delete({ where: { id } })]);
            changed(req, `deleted ${type} ${id}`);
            res.json({ ok: true });
        })
    );
}
langRoutes('/vocabulary', prisma.vocabulary, vocabularyInput, 'word', 'từ');
langRoutes('/sentences', prisma.sentence, sentenceInput, 'sentence', 'câu mẫu');

/* ───────────── Preview (drafts included, nothing is stored) ───────────── */
cmsRoutes.get(
    '/lessons/:id/preview',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const C = await freshContent();
        const stage = C.STAGES.find((s) => s.lessons.some((l) => l.id === id));
        const lesson = stage?.lessons.find((l) => l.id === id);
        if (!lesson) throw notFound('Không tìm thấy bài học.');
        const parts = PART_ORDER.map((p) => ({ ...C.PARTS[p], items: (lesson.parts?.[p] ?? []).map((iid) => publicItem(C, iid)).filter(Boolean) })).filter((p) => p.items.length);
        if (!parts.length) throw badRequest('Bài học chưa có câu bài tập nào để xem trước.', { code: 'lesson-empty' });
        res.json({
            lesson: { id: lesson.id, title: lesson.title, minutes: lesson.minutes, goals: lesson.goals ?? [], references: lessonReferences(C, lesson) },
            stage: { id: stage.id, title: stage.title, tone: stage.tone },
            parts,
            session: { step: 0, answers: {}, shadow: {} },
            threshold: C.PASS_THRESHOLD,
            best: null,
            published: lesson.published,
        });
    })
);

cmsRoutes.post(
    '/lessons/:id/preview/answers',
    ah(async (req, res) => {
        const id = parse(intId, req.params.id);
        const { itemId, response } = parse(z.object({ itemId: strId, response: z.union([z.string().max(500), z.array(z.string().max(200)).max(30)]) }), req.body);
        const C = await freshContent();
        const lesson = C.STAGES.flatMap((s) => s.lessons).find((l) => l.id === id);
        const item = C.ITEMS[itemId];
        if (!lesson || !item || !lessonItemIds(lesson).includes(itemId) || !isGradable(item)) throw badRequest('Câu hỏi không thuộc bài học này.');
        res.json({ correct: gradeResponse(item, response), ...revealed(C, itemId) });
    })
);

export { PART_OF_KIND };
