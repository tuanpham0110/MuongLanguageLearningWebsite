/**
 * Validation for content written in the admin area. Every exercise is checked against the rules the
 * grader relies on (the answer is one of the options, an order exercise has its tokens, …) so that a
 * published lesson can always be graded.
 */
import { z } from 'zod';

const norm = (s) => String(s ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

const text = (max, label) =>
    z
        .string({ error: `Vui lòng nhập ${label}.` })
        .transform((s) => s.normalize('NFC').trim())
        .pipe(z.string().min(1, `Vui lòng nhập ${label}.`).max(max, `${label[0].toUpperCase()}${label.slice(1)} tối đa ${max} ký tự.`));

const optional = (max) =>
    z
        .string()
        .max(max, `Tối đa ${max} ký tự.`)
        .optional()
        .nullable()
        .transform((s) => (s == null ? undefined : s.normalize('NFC').trim() || undefined));

/** An uploaded file (/api/media/<id>) or an https link. */
export const mediaUrl = z
    .string()
    .trim()
    .max(500)
    .regex(/^(\/api\/media\/[A-Za-z0-9_-]+|https:\/\/[^\s"'<>]+)$/, 'Đường dẫn tệp không hợp lệ (tải tệp lên hoặc dùng liên kết https).')
    .optional()
    .nullable()
    .or(z.literal('').transform(() => undefined))
    .transform((v) => v || undefined);

const distinct = (list) => new Set(list.map(norm)).size === list.length;

const options = z
    .array(text(120, 'lựa chọn'))
    .min(2, 'Cần ít nhất 2 lựa chọn.')
    .max(6, 'Tối đa 6 lựa chọn.')
    .refine(distinct, 'Các lựa chọn không được trùng nhau.');

const save = z
    .object({ type: z.enum(['word', 'sentence']), ref: z.string().regex(/^[\w-]{1,80}$/, 'Mục sổ tay không hợp lệ.') })
    .optional()
    .nullable()
    .transform((v) => v ?? undefined);

const common = {
    prompt: optional(200),
    explain: optional(600),
    translation: optional(600),
    audioUrl: mediaUrl,
    imageUrl: mediaUrl,
    save,
    reference: z.object({
        title: text(200, 'tên nguồn'),
        url: z.url().max(500).refine((url) => /^https:\/\//i.test(url), 'Liên kết nguồn phải dùng HTTPS.'),
        locator: optional(200),
        dialect: optional(120),
        note: optional(400),
    }).optional().nullable().transform((value) => value ?? undefined),
};

const answerInOptions = (v, ctx) => {
    if (!v.options.some((o) => norm(o) === norm(v.answer))) ctx.addIssue({ code: 'custom', path: ['answer'], message: 'Đáp án đúng phải là một trong các lựa chọn.' });
};

const listen = (kind) =>
    z
        .object({ kind: z.literal(kind), audioText: text(300, 'nội dung âm thanh'), options, answer: text(120, 'đáp án'), ...common })
        .superRefine(answerInOptions);

const fill = z
    .object({
        kind: z.literal('fill'),
        before: optional(200),
        after: optional(200),
        audioText: optional(300),
        options,
        answer: text(120, 'đáp án'),
        ...common,
    })
    .superRefine((v, ctx) => {
        answerInOptions(v, ctx);
        if (!v.before && !v.after) ctx.addIssue({ code: 'custom', path: ['before'], message: 'Cần có phần câu trước hoặc sau ô trống.' });
    });

const order = z.object({
    kind: z.literal('order'),
    // the sentence in the right order; the pieces are shuffled for the learner
    answer: z.array(text(60, 'từ')).min(2, 'Cần ít nhất 2 từ để sắp xếp.').max(12, 'Tối đa 12 từ.'),
    audioText: optional(300),
    ...common,
});

const shadow = z.object({
    kind: z.literal('shadow'),
    text: text(300, 'câu mẫu'),
    meaning: text(300, 'nghĩa tiếng Việt'),
    tips: z.array(text(200, 'gợi ý')).max(5, 'Tối đa 5 gợi ý.').optional().default([]),
    ...common,
});

export const itemInput = z.discriminatedUnion('kind', [listen('listen-pick'), listen('listen-meaning'), fill, order, shadow], {
    error: 'Dạng bài không hợp lệ.',
});

export const PART_OF_KIND = { 'listen-pick': 'listen', 'listen-meaning': 'listen', fill: 'build', order: 'build', shadow: 'shadow' };

/** Shuffles the pieces of an order exercise so the stored order never equals the answer. */
function scrambled(answer, rand = Math.random) {
    if (new Set(answer.map(norm)).size < 2) return [...answer];
    for (let attempt = 0; attempt < 20; attempt++) {
        const a = [...answer];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        if (a.some((t, i) => norm(t) !== norm(answer[i]))) return a;
    }
    return [...answer.slice(1), answer[0]];
}

/** Validated input → the Item row the grader and the player read (see content.service load()). */
export function toItemRow(input, rand) {
    const { kind, answer, explain, translation, ...rest } = input;
    const data = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (kind === 'order') data.tokens = scrambled(answer, rand);
    if (kind === 'shadow' && !data.tips?.length) delete data.tips;
    return {
        part: PART_OF_KIND[kind],
        kind,
        data,
        answer: kind === 'shadow' ? undefined : answer,
        explain: explain ?? null,
        translation: translation ?? null,
    };
}

const tones = ['leaf', 'clay', 'river'];

export const stageInput = z.object({
    title: text(120, 'tên chặng'),
    summary: text(300, 'mô tả chặng'),
    code: optional(4),
    tone: z.enum(tones, { error: 'Màu chặng không hợp lệ.' }).optional().default('leaf'),
});

export const lessonInput = z.object({
    stageId: z.number({ error: 'Vui lòng chọn chặng.' }).int().positive(),
    title: text(120, 'tên bài'),
    minutes: z.number({ error: 'Thời lượng không hợp lệ.' }).int().min(1, 'Thời lượng tối thiểu 1 phút.').max(60, 'Thời lượng tối đa 60 phút.'),
    goals: z.array(text(160, 'mục tiêu')).max(6, 'Tối đa 6 mục tiêu.').optional().default([]),
});

const ids = z.array(z.string().min(1).max(100)).max(30, 'Mỗi phần tối đa 30 câu.');
export const lessonItemsInput = z.object({ listen: ids.default([]), build: ids.default([]), shadow: ids.default([]) });

const langFields = {
    meaning: text(300, 'nghĩa tiếng Việt'),
    topic: text(60, 'chủ đề'),
    lessonId: z.number().int().positive().optional().nullable().transform((v) => v ?? null),
    dialect: optional(120),
    source: optional(300),
    audioUrl: mediaUrl,
};

export const vocabularyInput = z.object({
    word: text(120, 'từ tiếng Mường'),
    pronunciation: optional(120),
    note: optional(300),
    ...langFields,
});

export const sentenceInput = z.object({
    text: text(300, 'câu tiếng Mường'),
    note: optional(300),
    ...langFields,
});
