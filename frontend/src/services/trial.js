/**
 * Account-free adapter for the public "Học thử" lesson.
 * Same interface as the server adapter in LessonPlayer. Grading happens on the
 * backend (answers never reach the browser); nothing is stored.
 */
import { cms, content } from './api.js';

/** Admin preview of any lesson, drafts included: same flow as the trial, graded by the server, nothing stored. */
export function createPreviewAdapter(lessonId) {
    return createTrialAdapter({ load: () => cms.preview(lessonId), grade: (itemId, response) => cms.previewAnswer(lessonId, itemId, response) });
}

export function createTrialAdapter({ load = content.trial, grade = content.trialAnswer } = {}) {
    let lesson = null;
    let threshold = 80;
    const answers = {};
    const shadow = {};

    return {
        trial: true,
        async start() {
            const data = await load();
            lesson = data;
            threshold = data.threshold;
            return data;
        },
        async answer(itemId, response) {
            const r = await grade(itemId, response);
            if (!(itemId in answers)) answers[itemId] = r.correct;
            return r;
        },
        async rate(itemId, rating) {
            shadow[itemId] = rating;
            return { rating };
        },
        async saveStep() {},
        async finish() {
            const byPart = Object.fromEntries(lesson.parts.map((p) => [p.key, p.items.map((i) => i.id)]));
            const ids = (k) => byPart[k] ?? [];
            const parts = {
                listen: { correct: ids('listen').filter((id) => answers[id]).length, total: ids('listen').length },
                build: { correct: ids('build').filter((id) => answers[id]).length, total: ids('build').length },
                shadow: { practiced: ids('shadow').filter((id) => shadow[id] && shadow[id] !== 'skip').length, total: ids('shadow').length },
            };
            const total = parts.listen.total + parts.build.total;
            const score = total ? Math.round(((parts.listen.correct + parts.build.correct) / total) * 100) : 100;
            return {
                lessonId: lesson.lesson.id,
                title: lesson.lesson.title,
                score,
                passed: score >= threshold,
                parts,
                threshold,
                review: [],
                unlocked: [],
                next: null,
            };
        },
        async restart() {
            for (const k of Object.keys(answers)) delete answers[k];
            for (const k of Object.keys(shadow)) delete shadow[k];
        },
    };
}
