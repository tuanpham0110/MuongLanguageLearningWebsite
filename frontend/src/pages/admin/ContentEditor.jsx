import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Skeleton } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import Modal from '../../components/Modal.jsx';
import AudioPlayer from '../../components/learn/AudioPlayer.jsx';
import { cms } from '../../services/api.js';
import useAsync from '../../hooks/useAsync.js';
import { useToast } from '../../context/ToastContext.jsx';

/**
 * Quản trị → Soạn bài. Everything is saved through /api/admin/cms; the server validates every
 * exercise (see backend/src/modules/cms/schemas.js), so this page only shapes the input.
 */

const KINDS = {
    'listen-pick': { label: 'Nghe và chọn từ', part: 'listen' },
    'listen-meaning': { label: 'Nghe và chọn nghĩa', part: 'listen' },
    fill: { label: 'Điền từ còn thiếu', part: 'build' },
    order: { label: 'Sắp xếp thành câu', part: 'build' },
    shadow: { label: 'Nghe và nói lại', part: 'shadow' },
};
const PART_ORDER = ['listen', 'build', 'shadow'];
const TONES = { leaf: 'Xanh lá', clay: 'Cam đất', river: 'Xanh sông' };
const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

export function itemSummary(it) {
    if (!it) return '';
    if (it.kind === 'shadow') return `${it.text} = ${it.meaning}`;
    if (it.kind === 'order') return (it.answer || []).join(' ');
    if (it.kind === 'fill') return [it.before, `[${it.answer}]`, it.after].filter(Boolean).join(' ');
    return `${it.audioText} → ${it.answer}`;
}

/* ───────────── small form helpers ───────────── */
function Field({ label, hint, error, children, wide }) {
    return (
        <label className={`cms-field ${wide ? 'cms-field--wide' : ''} ${error ? 'has-error' : ''}`}>
            <span className="cms-field__label">{label}</span>
            {children}
            {error ? <small className="cms-field__error">{error}</small> : hint ? <small className="cms-field__hint">{hint}</small> : null}
        </label>
    );
}

function useForm(initial) {
    const [v, setV] = useState(initial);
    const [err, setErr] = useState({ field: null, message: '' });
    const bind = (k) => ({ value: v[k] ?? '', onChange: (e) => setV((s) => ({ ...s, [k]: e.target.value })) });
    const fieldError = (k) => (err.field === k || err.field?.startsWith(`${k}.`) ? err.message : '');
    return { v, setV, bind, err, setErr, fieldError };
}

/** Upload an image / recording, or clear it. */
function MediaField({ label, kind, value, onChange }) {
    const toast = useToast();
    const input = useRef(null);
    const [busy, setBusy] = useState(false);
    async function pick(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) return toast('Tệp tối đa 2 MB.', { tone: 'error' });
        setBusy(true);
        try {
            const m = await cms.upload(file);
            if (m.kind !== kind) toast(`Tệp vừa tải là ${m.kind === 'image' ? 'ảnh' : 'âm thanh'}, không dùng được ở ô này.`, { tone: 'error' });
            else onChange(m.url);
        } catch (er) {
            toast(er.message, { tone: 'error' });
        } finally {
            setBusy(false);
        }
    }
    return (
        <div className="cms-field cms-media">
            <span className="cms-field__label">{label}</span>
            <div className="cms-media__row">
                {value ? kind === 'image' ? <img src={value} alt="" className="cms-media__thumb" /> : <AudioPlayer src={value} text="" size="sm" label="Nghe tệp" /> : <span className="muted small">Chưa có</span>}
                <input ref={input} type="file" hidden accept={kind === 'image' ? 'image/png,image/jpeg,image/webp' : 'audio/*'} onChange={pick} />
                <Button type="button" variant="light" size="sm" iconLeft="arrow-down" loading={busy} onClick={() => input.current?.click()}>
                    {value ? 'Thay' : 'Tải lên'}
                </Button>
                {value && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => onChange('')}>
                        Gỡ
                    </Button>
                )}
            </div>
            <small className="cms-field__hint">{kind === 'image' ? 'PNG, JPEG, WebP · tối đa 2 MB' : 'Bản thu giọng người Mường: MP3, WAV, OGG, M4A · tối đa 2 MB'}</small>
        </div>
    );
}

/* ───────────── Exercise form ───────────── */
function toForm(it) {
    return {
        kind: it?.kind ?? 'listen-pick',
        prompt: it?.prompt ?? '',
        audioText: it?.audioText ?? '',
        options: (it?.options ?? []).join('\n'),
        answer: it?.kind === 'order' ? (it.answer ?? []).join('\n') : (it?.answer ?? ''),
        before: it?.before ?? '',
        after: it?.after ?? '',
        text: it?.text ?? '',
        meaning: it?.meaning ?? '',
        tips: (it?.tips ?? []).join('\n'),
        explain: it?.explain ?? '',
        translation: it?.translation ?? '',
        audioUrl: it?.audioUrl ?? '',
        imageUrl: it?.imageUrl ?? '',
        save: it?.save ? `${it.save.type}:${it.save.ref}` : '',
        reference: it?.reference ?? null,
    };
}

function toPayload(f) {
    const save = f.save ? { type: f.save.split(':')[0], ref: f.save.slice(f.save.indexOf(':') + 1) } : null;
    const common = { prompt: f.prompt, explain: f.explain, translation: f.translation, audioUrl: f.audioUrl, imageUrl: f.imageUrl, save, reference: f.reference };
    switch (f.kind) {
        case 'shadow':
            return { kind: f.kind, text: f.text, meaning: f.meaning, tips: lines(f.tips), ...common };
        case 'order':
            return { kind: f.kind, answer: lines(f.answer), audioText: f.audioText, ...common };
        case 'fill':
            return { kind: f.kind, before: f.before, after: f.after, audioText: f.audioText, options: lines(f.options), answer: f.answer, ...common };
        default:
            return { kind: f.kind, audioText: f.audioText, options: lines(f.options), answer: f.answer, ...common };
    }
}

function ItemForm({ open, item, part, lessonId, data, onClose, onSaved }) {
    const toast = useToast();
    // an exercise stays in its part (listen / build / shadow): the server refuses to move one used in a lesson
    const ownPart = item ? KINDS[item.kind]?.part : part;
    const kinds = Object.entries(KINDS).filter(([, k]) => !ownPart || k.part === ownPart);
    const form = useForm(toForm(item ?? { kind: kinds[0]?.[0] }));
    const { v, setV, bind, setErr, fieldError, err } = form;
    const [busy, setBusy] = useState(false);
    const options = lines(v.options);

    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        setErr({ field: null, message: '' });
        try {
            if (item) await cms.updateItem(item.id, toPayload(v));
            else await cms.createItem({ ...toPayload(v), lessonId });
            toast(item ? 'Đã lưu câu bài tập.' : 'Đã thêm câu vào bài.');
            onSaved();
        } catch (er) {
            setErr({ field: er.field ?? null, message: er.message });
        } finally {
            setBusy(false);
        }
    }

    const k = v.kind;
    const listenLike = k === 'listen-pick' || k === 'listen-meaning';
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={item ? `Sửa câu ${item.id}` : 'Thêm câu bài tập'}
            footer={
                <>
                    <Button variant="light" onClick={onClose}>
                        Huỷ
                    </Button>
                    <Button type="submit" form="cms-item-form" variant="leaf" loading={busy}>
                        Lưu
                    </Button>
                </>
            }
        >
            <form id="cms-item-form" className="cms-form" onSubmit={submit} noValidate>
                {err.message && !err.field && (
                    <p className="stage__error" role="alert">
                        <Icon name="alert" size={16} /> {err.message}
                    </p>
                )}
                <Field label="Dạng bài" wide>
                    <select className="cms-input" {...bind('kind')}>
                        {kinds.map(([key, x]) => (
                            <option key={key} value={key}>
                                {x.label}
                            </option>
                        ))}
                    </select>
                </Field>
                {k !== 'shadow' && (
                    <Field label="Đề bài (tuỳ chọn)" error={fieldError('prompt')} wide>
                        <input className="cms-input" {...bind('prompt')} maxLength={200} placeholder="Ví dụ: Nghe và chọn đáp án đúng" />
                    </Field>
                )}
                {listenLike && (
                    <Field label="Nội dung âm thanh (tiếng Mường)" hint="Giọng máy đọc nội dung này khi chưa có bản thu." error={fieldError('audioText')} wide>
                        <input className="cms-input" lang="mtq" {...bind('audioText')} />
                    </Field>
                )}
                {k === 'fill' && (
                    <>
                        <Field label="Phần câu trước ô trống" error={fieldError('before')}>
                            <input className="cms-input" lang="mtq" {...bind('before')} />
                        </Field>
                        <Field label="Phần câu sau ô trống" error={fieldError('after')}>
                            <input className="cms-input" lang="mtq" {...bind('after')} />
                        </Field>
                    </>
                )}
                {(listenLike || k === 'fill') && (
                    <>
                        <Field label="Các lựa chọn (mỗi dòng một lựa chọn)" hint="2–6 lựa chọn, không trùng nhau. Thứ tự được xáo khi người học làm." error={fieldError('options')} wide>
                            <textarea className="cms-input" rows={4} {...bind('options')} />
                        </Field>
                        <Field label="Đáp án đúng" error={fieldError('answer')} wide>
                            <select className="cms-input" {...bind('answer')}>
                                <option value="">— Chọn trong các lựa chọn —</option>
                                {options.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        </Field>
                    </>
                )}
                {k === 'order' && (
                    <Field label="Câu đúng – mỗi dòng một từ/cụm, đúng thứ tự" hint="Máy chủ tự xáo trộn khi hiển thị cho người học." error={fieldError('answer')} wide>
                        <textarea className="cms-input" lang="mtq" rows={5} {...bind('answer')} />
                    </Field>
                )}
                {(k === 'fill' || k === 'order') && (
                    <Field label="Câu đầy đủ để đọc sau khi trả lời (tuỳ chọn)" error={fieldError('audioText')} wide>
                        <input className="cms-input" lang="mtq" {...bind('audioText')} />
                    </Field>
                )}
                {k === 'shadow' && (
                    <>
                        <Field label="Câu mẫu (tiếng Mường)" error={fieldError('text')} wide>
                            <input className="cms-input" lang="mtq" {...bind('text')} />
                        </Field>
                        <Field label="Nghĩa tiếng Việt" error={fieldError('meaning')} wide>
                            <input className="cms-input" {...bind('meaning')} />
                        </Field>
                        <Field label="Gợi ý luyện nói (mỗi dòng một gợi ý)" error={fieldError('tips')} wide>
                            <textarea className="cms-input" rows={3} {...bind('tips')} />
                        </Field>
                    </>
                )}
                {k !== 'shadow' && (
                    <>
                        <Field label="Giải thích sau khi trả lời" error={fieldError('explain')} wide>
                            <textarea className="cms-input" rows={2} {...bind('explain')} />
                        </Field>
                        <Field label="Dịch nghĩa" error={fieldError('translation')} wide>
                            <textarea className="cms-input" rows={2} {...bind('translation')} />
                        </Field>
                    </>
                )}
                <Field label="Nút “Lưu vào sổ tay” gắn với" hint="Chọn từ / câu đã kiểm chứng mà câu này dạy." error={fieldError('save')} wide>
                    <select className="cms-input" {...bind('save')}>
                        <option value="">— Không gắn —</option>
                        <optgroup label="Từ vựng">
                            {data.vocabulary.map((w) => (
                                <option key={w.id} value={`word:${w.id}`}>
                                    {w.word} – {w.meaning}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="Câu mẫu">
                            {data.sentences.map((s) => (
                                <option key={s.id} value={`sentence:${s.id}`}>
                                    {s.text}
                                </option>
                            ))}
                        </optgroup>
                    </select>
                </Field>
                <div className="cms-field cms-field--wide">
                    <span className="cms-field__label">Nguồn đối chiếu của câu bài tập</span>
                    {v.reference ? <>
                        {[
                            ['title', 'Tên tác giả / tài liệu'], ['url', 'Liên kết HTTPS'],
                            ['locator', 'Trang / mục'], ['dialect', 'Vùng / thổ ngữ'], ['note', 'Ghi chú phạm vi'],
                        ].map(([key, label]) => <Field key={key} label={label} error={fieldError(`reference.${key}`)}>
                            <input className="cms-input" value={v.reference[key] ?? ''} onChange={(e) => setV((s) => ({ ...s, reference: { ...s.reference, [key]: e.target.value } }))} />
                        </Field>)}
                        <Button type="button" variant="ghost" size="sm" onClick={() => setV((s) => ({ ...s, reference: null }))}>Gỡ nguồn</Button>
                    </> : <Button type="button" variant="light" size="sm" onClick={() => setV((s) => ({ ...s, reference: { title: '', url: '' } }))}>Thêm nguồn</Button>}
                    <small className="cms-field__hint">Khi đổi từ/câu hoặc nghĩa, hãy đối chiếu lại và cập nhật nguồn tương ứng.</small>
                </div>
                <MediaField label="Bản thu âm" kind="audio" value={v.audioUrl} onChange={(url) => setV((s) => ({ ...s, audioUrl: url }))} />
                <MediaField label="Hình minh hoạ" kind="image" value={v.imageUrl} onChange={(url) => setV((s) => ({ ...s, imageUrl: url }))} />
                {fieldError('audioUrl') || fieldError('imageUrl') ? <small className="cms-field__error">{fieldError('audioUrl') || fieldError('imageUrl')}</small> : null}
            </form>
        </Modal>
    );
}

/* ───────────── Stage & lesson forms ───────────── */
function StageForm({ open, stage, onClose, onSaved }) {
    const toast = useToast();
    const { v, bind, setErr, fieldError, err } = useForm({ title: stage?.title ?? '', summary: stage?.summary ?? '', tone: stage?.tone ?? 'leaf', code: stage?.code ?? '' });
    const [busy, setBusy] = useState(false);
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const body = { title: v.title, summary: v.summary, tone: v.tone, code: v.code };
            if (stage) await cms.updateStage(stage.id, body);
            else await cms.createStage(body);
            toast(stage ? 'Đã lưu chặng.' : 'Đã tạo chặng mới.');
            onSaved();
        } catch (er) {
            setErr({ field: er.field ?? null, message: er.message });
        } finally {
            setBusy(false);
        }
    }
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={stage ? `Sửa chặng ${stage.code}` : 'Chặng mới'}
            footer={
                <>
                    <Button variant="light" onClick={onClose}>
                        Huỷ
                    </Button>
                    <Button type="submit" form="cms-stage-form" variant="leaf" loading={busy}>
                        Lưu
                    </Button>
                </>
            }
        >
            <form id="cms-stage-form" className="cms-form" onSubmit={submit} noValidate>
                {err.message && !err.field && <p className="stage__error">{err.message}</p>}
                <Field label="Tên chặng" error={fieldError('title')} wide>
                    <input className="cms-input" {...bind('title')} autoFocus />
                </Field>
                <Field label="Mô tả ngắn" error={fieldError('summary')} wide>
                    <textarea className="cms-input" rows={2} {...bind('summary')} />
                </Field>
                <Field label="Mã hiển thị" hint="Ví dụ 04. Để trống sẽ tự đặt." error={fieldError('code')}>
                    <input className="cms-input" {...bind('code')} maxLength={4} />
                </Field>
                <Field label="Màu" error={fieldError('tone')}>
                    <select className="cms-input" {...bind('tone')}>
                        {Object.entries(TONES).map(([k, l]) => (
                            <option key={k} value={k}>
                                {l}
                            </option>
                        ))}
                    </select>
                </Field>
            </form>
        </Modal>
    );
}

function LessonForm({ open, lesson, stageId, stages, onClose, onSaved }) {
    const toast = useToast();
    const { v, bind, setErr, fieldError, err } = useForm({ title: lesson?.title ?? '', minutes: String(lesson?.minutes ?? 5), goals: (lesson?.goals ?? []).join('\n'), stageId: String(lesson?.stageId ?? stageId ?? stages[0]?.id ?? '') });
    const [busy, setBusy] = useState(false);
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const body = { title: v.title, minutes: Number(v.minutes), goals: lines(v.goals), stageId: Number(v.stageId) };
            const saved = lesson ? await cms.updateLesson(lesson.id, body) : await cms.createLesson(body);
            toast(lesson ? 'Đã lưu bài học.' : `Đã tạo Bài ${saved.id} (bản nháp).`);
            onSaved(saved.id);
        } catch (er) {
            setErr({ field: er.field ?? null, message: er.message });
        } finally {
            setBusy(false);
        }
    }
    return (
        <Modal
            open={open}
            onClose={onClose}
            title={lesson ? `Sửa Bài ${lesson.id}` : 'Bài học mới'}
            footer={
                <>
                    <Button variant="light" onClick={onClose}>
                        Huỷ
                    </Button>
                    <Button type="submit" form="cms-lesson-form" variant="leaf" loading={busy}>
                        Lưu
                    </Button>
                </>
            }
        >
            <form id="cms-lesson-form" className="cms-form" onSubmit={submit} noValidate>
                {err.message && !err.field && <p className="stage__error">{err.message}</p>}
                <Field label="Tên bài" error={fieldError('title')} wide>
                    <input className="cms-input" {...bind('title')} autoFocus />
                </Field>
                <Field label="Chặng" error={fieldError('stageId')}>
                    <select className="cms-input" {...bind('stageId')}>
                        {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.code} · {s.title}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Thời lượng (phút)" error={fieldError('minutes')}>
                    <input className="cms-input" type="number" min={1} max={60} {...bind('minutes')} />
                </Field>
                <Field label="Mục tiêu bài học (mỗi dòng một mục tiêu)" error={fieldError('goals')} wide>
                    <textarea className="cms-input" rows={3} {...bind('goals')} />
                </Field>
            </form>
        </Modal>
    );
}

/* ───────────── Lesson editor ───────────── */
function LessonEditor({ lesson, stage, data, reload, onEdit, onDeleted }) {
    const toast = useToast();
    const items = useMemo(() => new Map(data.items.map((i) => [i.id, i])), [data.items]);
    const [form, setForm] = useState(null); // { part, item? }
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [pick, setPick] = useState({ listen: '', build: '', shadow: '' });

    const run = async (fn, ok) => {
        setBusy(true);
        try {
            await fn();
            if (ok) toast(ok);
            await reload();
        } catch (e) {
            toast(e.message, { tone: 'error' });
        } finally {
            setBusy(false);
        }
    };
    const setParts = (parts, ok) => run(() => cms.setLessonItems(lesson.id, parts), ok);
    const movePart = (part, i, d) => {
        const list = [...lesson.parts[part]];
        [list[i], list[i + d]] = [list[i + d], list[i]];
        setParts({ ...lesson.parts, [part]: list });
    };
    const total = PART_ORDER.reduce((n, p) => n + lesson.parts[p].length, 0);

    return (
        <section className="panel cms-lesson" aria-label={`Bài ${lesson.id}`}>
            <header className="cms-lesson__head">
                <div>
                    <span className={`tag ${lesson.published ? 'tag--leaf' : 'tag--muted'}`}>{lesson.published ? 'Đã xuất bản' : 'Bản nháp'}</span>
                    <h2>
                        Bài {lesson.id}: {lesson.title}
                    </h2>
                    <p className="muted small">
                        Chặng {stage.code} · {lesson.minutes} phút · {total} câu · {lesson.attempts} lượt làm
                    </p>
                    {lesson.goals?.length > 0 && (
                        <ul className="cms-goals">
                            {lesson.goals.map((g) => (
                                <li key={g}>{g}</li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="cms-lesson__actions">
                    <Button variant="light" size="sm" iconLeft="guide" onClick={onEdit}>
                        Sửa thông tin
                    </Button>
                    {total > 0 && (
                        <Button to={`/quan-tri/xem-truoc/${lesson.id}`} variant="light" size="sm" iconLeft="eye">
                            Xem trước
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant={lesson.published ? 'light' : 'leaf'}
                        iconLeft={lesson.published ? 'eye-off' : 'check'}
                        disabled={busy || (!lesson.published && !total)}
                        title={!total ? 'Thêm ít nhất một câu trước khi xuất bản' : undefined}
                        onClick={() => run(() => cms.publishLesson(lesson.id, !lesson.published), lesson.published ? 'Đã ẩn bài khỏi người học.' : 'Đã xuất bản. Người học thấy bài trong vòng 1 phút.')}
                    >
                        {lesson.published ? 'Ẩn bài' : 'Xuất bản'}
                    </Button>
                    {!lesson.published && (
                        <Button variant="ghost" size="sm" iconLeft="trash" disabled={busy} onClick={() => setConfirm(true)}>
                            Xoá
                        </Button>
                    )}
                </div>
            </header>

            {PART_ORDER.map((part) => {
                const list = lesson.parts[part];
                const available = data.items.filter((i) => i.part === part && !list.includes(i.id));
                return (
                    <div key={part} className="cms-part">
                        <h3>
                            <Icon name={data.parts[part].icon} size={18} /> {data.parts[part].title} <small>· {list.length} câu</small>
                        </h3>
                        {list.length === 0 ? (
                            <p className="muted small">Chưa có câu nào.</p>
                        ) : (
                            <ol className="cms-items">
                                {list.map((id, i) => {
                                    const it = items.get(id);
                                    return (
                                        <li key={id}>
                                            <span className="cms-items__main">
                                                <strong lang="mtq">{itemSummary(it)}</strong>
                                                <small>
                                                    {KINDS[it?.kind]?.label} · {id}
                                                    {it?.usedIn?.length > 1 && ` · dùng ở bài ${it.usedIn.join(', ')}`}
                                                    {it?.audioUrl && ' · có bản thu'}
                                                    {it?.imageUrl && ' · có ảnh'}
                                                </small>
                                            </span>
                                            <span className="cms-items__tools">
                                                <button className="icon-btn" aria-label="Lên" disabled={busy || i === 0} onClick={() => movePart(part, i, -1)}>
                                                    <Icon name="chevron-down" size={16} className="flip" />
                                                </button>
                                                <button className="icon-btn" aria-label="Xuống" disabled={busy || i === list.length - 1} onClick={() => movePart(part, i, 1)}>
                                                    <Icon name="chevron-down" size={16} />
                                                </button>
                                                <button className="icon-btn" aria-label={`Sửa câu ${id}`} onClick={() => setForm({ part, item: it })}>
                                                    <Icon name="guide" size={16} />
                                                </button>
                                                <button
                                                    className="icon-btn"
                                                    aria-label={`Gỡ câu ${id} khỏi bài`}
                                                    disabled={busy}
                                                    onClick={() => setParts({ ...lesson.parts, [part]: list.filter((x) => x !== id) }, 'Đã gỡ câu khỏi bài (câu vẫn còn trong ngân hàng câu).')}
                                                >
                                                    <Icon name="x" size={16} />
                                                </button>
                                            </span>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        <div className="cms-part__add">
                            <Button variant="light" size="sm" iconLeft="sparkle" onClick={() => setForm({ part })}>
                                Thêm câu mới
                            </Button>
                            {available.length > 0 && (
                                <span className="cms-part__reuse">
                                    <select className="cms-input cms-input--sm" aria-label="Chọn câu có sẵn" value={pick[part]} onChange={(e) => setPick((p) => ({ ...p, [part]: e.target.value }))}>
                                        <option value="">Dùng câu có sẵn…</option>
                                        {available.map((i) => (
                                            <option key={i.id} value={i.id}>
                                                {itemSummary(i)} ({i.id})
                                            </option>
                                        ))}
                                    </select>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={!pick[part] || busy}
                                        onClick={() => {
                                            setParts({ ...lesson.parts, [part]: [...list, pick[part]] }, 'Đã thêm câu vào bài.');
                                            setPick((p) => ({ ...p, [part]: '' }));
                                        }}
                                    >
                                        Thêm
                                    </Button>
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}

            {form && (
                <ItemForm
                    open
                    item={form.item}
                    part={form.part}
                    lessonId={lesson.id}
                    data={data}
                    onClose={() => setForm(null)}
                    onSaved={async () => {
                        setForm(null);
                        await reload();
                    }}
                />
            )}
            <Modal
                open={confirm}
                onClose={() => setConfirm(false)}
                title={`Xoá Bài ${lesson.id}?`}
                footer={
                    <>
                        <Button variant="light" onClick={() => setConfirm(false)}>
                            Huỷ
                        </Button>
                        <Button
                            className="btn--danger-solid"
                            loading={busy}
                            onClick={() =>
                                run(async () => {
                                    await cms.deleteLesson(lesson.id);
                                    setConfirm(false);
                                    onDeleted();
                                }, 'Đã xoá bài học.')
                            }
                        >
                            Xoá bài
                        </Button>
                    </>
                }
            >
                <p className="modal__lead">Các câu bài tập vẫn được giữ trong ngân hàng câu. Bài đã có người học làm thì không xoá được – hãy để ở trạng thái ẩn.</p>
            </Modal>
        </section>
    );
}

/* ───────────── Lessons view ───────────── */
function LessonsView({ data, reload }) {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const selected = Number(params.get('lesson')) || null;
    const select = (id) => setParams(id ? { tab: 'cms', lesson: String(id) } : { tab: 'cms' }, { replace: true });
    const [stageForm, setStageForm] = useState(null); // { stage? }
    const [lessonForm, setLessonForm] = useState(null); // { lesson?, stageId? }

    const all = data.stages.flatMap((s) => s.lessons.map((l) => ({ lesson: l, stage: s })));
    const current = all.find((x) => x.lesson.id === selected);

    async function move(lesson, dir) {
        try {
            await cms.moveLesson(lesson.id, dir);
            await reload();
        } catch (e) {
            toast(e.message, { tone: 'error' });
        }
    }
    async function removeStage(stage) {
        try {
            await cms.deleteStage(stage.id);
            toast('Đã xoá chặng.');
            await reload();
        } catch (e) {
            toast(e.message, { tone: 'error' });
        }
    }

    return (
        <div className="cms-layout">
            <nav className="panel cms-tree" aria-label="Chặng và bài học">
                {data.stages.map((s) => (
                    <div key={s.id} className="cms-tree__stage">
                        <div className="cms-tree__stagehead">
                            <span className={`cms-tree__code cms-tree__code--${s.tone}`}>{s.code}</span>
                            <strong>{s.title}</strong>
                            <button className="icon-btn" aria-label={`Sửa chặng ${s.code}`} onClick={() => setStageForm({ stage: s })}>
                                <Icon name="guide" size={16} />
                            </button>
                            {s.lessons.length === 0 && (
                                <button className="icon-btn" aria-label={`Xoá chặng ${s.code}`} onClick={() => removeStage(s)}>
                                    <Icon name="trash" size={16} />
                                </button>
                            )}
                        </div>
                        <ul>
                            {s.lessons.map((l, i) => (
                                <li key={l.id} className={l.id === selected ? 'is-on' : ''}>
                                    <button type="button" className="cms-tree__lesson" onClick={() => select(l.id)} aria-current={l.id === selected ? 'true' : undefined}>
                                        <i className={l.published ? 'is-pub' : ''} aria-label={l.published ? 'Đã xuất bản' : 'Bản nháp'} />
                                        <span>
                                            Bài {l.id}: {l.title}
                                        </span>
                                    </button>
                                    <span className="cms-tree__move">
                                        <button className="icon-btn" aria-label={`Đưa Bài ${l.id} lên`} disabled={i === 0} onClick={() => move(l, -1)}>
                                            <Icon name="chevron-down" size={14} className="flip" />
                                        </button>
                                        <button className="icon-btn" aria-label={`Đưa Bài ${l.id} xuống`} disabled={i === s.lessons.length - 1} onClick={() => move(l, 1)}>
                                            <Icon name="chevron-down" size={14} />
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <button type="button" className="link link--sm cms-tree__add" onClick={() => setLessonForm({ stageId: s.id })}>
                            + Thêm bài vào chặng
                        </button>
                    </div>
                ))}
                <Button variant="light" size="sm" iconLeft="flag" onClick={() => setStageForm({})}>
                    Thêm chặng
                </Button>
            </nav>

            {current ? (
                <LessonEditor
                    key={current.lesson.id}
                    lesson={current.lesson}
                    stage={current.stage}
                    data={data}
                    reload={reload}
                    onEdit={() => setLessonForm({ lesson: current.lesson })}
                    onDeleted={() => select(null)}
                />
            ) : (
                <section className="panel">
                    <EmptyState title="Chọn một bài để soạn" art="/assets/mascot-book.webp">
                        Bài nháp (chấm xám) người học chưa thấy. Thêm câu bài tập, xem trước rồi bấm Xuất bản.
                    </EmptyState>
                </section>
            )}

            {stageForm && <StageForm open stage={stageForm.stage} onClose={() => setStageForm(null)} onSaved={async () => (setStageForm(null), await reload())} />}
            {lessonForm && (
                <LessonForm
                    open
                    lesson={lessonForm.lesson}
                    stageId={lessonForm.stageId}
                    stages={data.stages}
                    onClose={() => setLessonForm(null)}
                    onSaved={async (id) => {
                        setLessonForm(null);
                        await reload();
                        select(id);
                    }}
                />
            )}
        </div>
    );
}

/* ───────────── Vocabulary & sentences ───────────── */
const ENTRY = {
    vocabulary: { title: 'Từ vựng', main: 'word', mainLabel: 'Từ tiếng Mường', one: 'từ' },
    sentences: { title: 'Câu mẫu', main: 'text', mainLabel: 'Câu tiếng Mường', one: 'câu mẫu' },
};

function EntryForm({ kind, entry, lessons, onClose, onSaved }) {
    const toast = useToast();
    const cfg = ENTRY[kind];
    const { v, setV, bind, setErr, fieldError, err } = useForm({
        main: entry?.[cfg.main] ?? '',
        meaning: entry?.meaning ?? '',
        topic: entry?.topic ?? '',
        lessonId: entry?.lessonId ? String(entry.lessonId) : '',
        pronunciation: entry?.pronunciation ?? '',
        note: entry?.note ?? '',
        dialect: entry?.dialect ?? '',
        source: entry?.source ?? '',
        audioUrl: entry?.audioUrl ?? '',
    });
    const [busy, setBusy] = useState(false);
    async function submit(e) {
        e.preventDefault();
        setBusy(true);
        try {
            const body = { [cfg.main]: v.main, meaning: v.meaning, topic: v.topic, lessonId: v.lessonId ? Number(v.lessonId) : null, note: v.note, dialect: v.dialect, source: v.source, audioUrl: v.audioUrl };
            if (kind === 'vocabulary') body.pronunciation = v.pronunciation;
            await cms.saveEntry(kind, entry?.id, body);
            toast(entry ? 'Đã lưu.' : `Đã thêm ${cfg.one}.`);
            onSaved();
        } catch (er) {
            setErr({ field: er.field === cfg.main ? 'main' : (er.field ?? null), message: er.message });
        } finally {
            setBusy(false);
        }
    }
    return (
        <Modal
            open
            onClose={onClose}
            title={entry ? `Sửa ${cfg.one}` : `Thêm ${cfg.one}`}
            footer={
                <>
                    <Button variant="light" onClick={onClose}>
                        Huỷ
                    </Button>
                    <Button type="submit" form="cms-entry-form" variant="leaf" loading={busy}>
                        Lưu
                    </Button>
                </>
            }
        >
            <form id="cms-entry-form" className="cms-form" onSubmit={submit} noValidate>
                {err.message && !err.field && <p className="stage__error">{err.message}</p>}
                <p className="muted small cms-form__note">Chỉ nhập dữ liệu đã được người bản địa hoặc tài liệu đáng tin cậy xác nhận, và ghi rõ nguồn.</p>
                <Field label={cfg.mainLabel} error={fieldError('main')} wide>
                    <input className="cms-input" lang="mtq" {...bind('main')} autoFocus />
                </Field>
                <Field label="Nghĩa tiếng Việt" error={fieldError('meaning')} wide>
                    <input className="cms-input" {...bind('meaning')} />
                </Field>
                <Field label="Chủ đề" hint="Ví dụ: Số đếm, Gia đình" error={fieldError('topic')}>
                    <input className="cms-input" {...bind('topic')} />
                </Field>
                <Field label="Thuộc bài" error={fieldError('lessonId')}>
                    <select className="cms-input" {...bind('lessonId')}>
                        <option value="">— Không gắn bài —</option>
                        {lessons.map((l) => (
                            <option key={l.id} value={l.id}>
                                Bài {l.id}: {l.title}
                            </option>
                        ))}
                    </select>
                </Field>
                {kind === 'vocabulary' && (
                    <Field label="Cách đọc / phiên âm" hint="Để trống nếu chưa có nguồn." error={fieldError('pronunciation')}>
                        <input className="cms-input" {...bind('pronunciation')} />
                    </Field>
                )}
                <Field label="Vùng / phương ngữ" error={fieldError('dialect')}>
                    <input className="cms-input" {...bind('dialect')} placeholder="Ví dụ: Mường Bi (Hoà Bình)" />
                </Field>
                <Field label="Nguồn kiểm chứng" error={fieldError('source')} wide>
                    <input className="cms-input" {...bind('source')} placeholder="Người bản địa, tài liệu…" />
                </Field>
                <Field label="Ghi chú" error={fieldError('note')} wide>
                    <textarea className="cms-input" rows={2} {...bind('note')} />
                </Field>
                <MediaField label="Bản thu âm" kind="audio" value={v.audioUrl} onChange={(url) => setV((s) => ({ ...s, audioUrl: url }))} />
            </form>
        </Modal>
    );
}

function EntriesView({ kind, data, reload }) {
    const toast = useToast();
    const cfg = ENTRY[kind];
    const rows = kind === 'vocabulary' ? data.vocabulary : data.sentences;
    const lessons = data.stages.flatMap((s) => s.lessons);
    const [q, setQ] = useState('');
    const [form, setForm] = useState(null);
    const [toDelete, setToDelete] = useState(null);
    const [busy, setBusy] = useState(false);
    const shown = rows.filter((r) => !q.trim() || `${r[cfg.main]} ${r.meaning} ${r.topic}`.toLowerCase().includes(q.trim().toLowerCase()));

    async function remove() {
        setBusy(true);
        try {
            await cms.deleteEntry(kind, toDelete.id);
            toast('Đã xoá.');
            setToDelete(null);
            await reload();
        } catch (e) {
            toast(e.message, { tone: 'error' });
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="panel cms-entries">
            <div className="adm-users__bar">
                <input className="cms-input" type="search" placeholder={`Tìm ${cfg.one}…`} aria-label={`Tìm ${cfg.one}`} value={q} onChange={(e) => setQ(e.target.value)} />
                <Button variant="leaf" size="sm" iconLeft="sparkle" onClick={() => setForm({})}>
                    Thêm {cfg.one}
                </Button>
            </div>
            {shown.length === 0 ? (
                <EmptyState title={rows.length ? 'Không có kết quả' : `Chưa có ${cfg.one} nào`}>{rows.length ? 'Thử từ khoá khác.' : 'Thêm dữ liệu đã kiểm chứng để dùng trong bài học và từ điển.'}</EmptyState>
            ) : (
                <ul className="cms-entry-list">
                    {shown.map((r) => (
                        <li key={r.id}>
                            <span className="cms-items__main">
                                <strong lang="mtq">{r[cfg.main]}</strong>
                                <span>{r.meaning}</span>
                                <small>
                                    {r.topic}
                                    {r.lessonId && ` · Bài ${r.lessonId}`}
                                    {r.pronunciation && ` · đọc: ${r.pronunciation}`}
                                    {r.dialect && ` · ${r.dialect}`}
                                    {r.source ? ` · nguồn: ${r.source}` : ' · chưa ghi nguồn'}
                                    {r.audioUrl && ' · có bản thu'}
                                </small>
                            </span>
                            <span className="cms-items__tools">
                                <button className="icon-btn" aria-label={`Sửa ${r[cfg.main]}`} onClick={() => setForm({ entry: r })}>
                                    <Icon name="guide" size={16} />
                                </button>
                                <button className="icon-btn" aria-label={`Xoá ${r[cfg.main]}`} onClick={() => setToDelete(r)}>
                                    <Icon name="trash" size={16} />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            {form && <EntryForm kind={kind} entry={form.entry} lessons={lessons} onClose={() => setForm(null)} onSaved={async () => (setForm(null), await reload())} />}
            <Modal
                open={!!toDelete}
                onClose={() => setToDelete(null)}
                title={`Xoá “${toDelete?.[cfg.main]}”?`}
                footer={
                    <>
                        <Button variant="light" onClick={() => setToDelete(null)}>
                            Huỷ
                        </Button>
                        <Button className="btn--danger-solid" loading={busy} onClick={remove}>
                            Xoá
                        </Button>
                    </>
                }
            >
                <p className="modal__lead">Mục này sẽ bị gỡ khỏi từ điển và sổ tay của người học. Câu bài tập nào đang gắn với mục này cần được sửa trước.</p>
            </Modal>
        </section>
    );
}

/* ───────────── Media library ───────────── */
function MediaView() {
    const toast = useToast();
    const { data, error, loading, reload } = useAsync(() => cms.media(), []);
    const input = useRef(null);
    const [busy, setBusy] = useState(false);
    if (error) return <ErrorState onRetry={reload}>{error.message}</ErrorState>;
    if (loading && !data) return <Skeleton h={200} r={18} />;
    async function upload(e) {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
            await cms.upload(file);
            toast('Đã tải tệp lên.');
            reload();
        } catch (er) {
            toast(er.message, { tone: 'error' });
        } finally {
            setBusy(false);
        }
    }
    async function remove(m) {
        try {
            await cms.deleteMedia(m.id);
            toast('Đã xoá tệp.');
            reload();
        } catch (er) {
            toast(er.message, { tone: 'error' });
        }
    }
    return (
        <section className="panel cms-entries">
            <div className="adm-users__bar">
                <span className="muted small">{data.length} tệp · ảnh PNG/JPEG/WebP, âm thanh MP3/WAV/OGG/M4A, tối đa 2 MB</span>
                <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,audio/*" onChange={upload} />
                <Button variant="leaf" size="sm" iconLeft="arrow-down" loading={busy} onClick={() => input.current?.click()}>
                    Tải tệp lên
                </Button>
            </div>
            {data.length === 0 ? (
                <EmptyState title="Chưa có tệp nào">Tải ảnh minh hoạ hoặc bản thu giọng người Mường, rồi gắn vào câu bài tập hoặc từ vựng.</EmptyState>
            ) : (
                <ul className="cms-entry-list">
                    {data.map((m) => (
                        <li key={m.id}>
                            {m.kind === 'image' ? <img src={m.url} alt="" className="cms-media__thumb" /> : <AudioPlayer src={m.url} text="" size="sm" label={`Nghe ${m.name}`} />}
                            <span className="cms-items__main">
                                <strong>{m.name}</strong>
                                <small>
                                    {m.mime} · {Math.round(m.size / 1024)} KB · {m.url}
                                </small>
                            </span>
                            <span className="cms-items__tools">
                                <button className="icon-btn" aria-label={`Xoá ${m.name}`} onClick={() => remove(m)}>
                                    <Icon name="trash" size={16} />
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/* ───────────── Root ───────────── */
const VIEWS = [
    { key: 'lessons', label: 'Bài học' },
    { key: 'vocabulary', label: 'Từ vựng' },
    { key: 'sentences', label: 'Câu mẫu' },
    { key: 'media', label: 'Tệp ảnh & âm thanh' },
];

export default function ContentEditor() {
    const { data, error, loading, reload } = useAsync(() => cms.all(), []);
    const [view, setView] = useState('lessons');
    // keep showing the previous data while reloading after a change
    const [last, setLast] = useState(null);
    useEffect(() => {
        if (data) setLast(data);
    }, [data]);
    const shown = data ?? last;
    const refresh = () => new Promise((resolve) => {
        reload();
        setTimeout(resolve, 0);
    });

    if (error && !shown) return <ErrorState onRetry={reload}>{error.message}</ErrorState>;
    if (!shown) return <Skeleton h={360} r={18} />;
    return (
        <div className="cms" aria-busy={loading || undefined}>
            <div className="chips" role="tablist" aria-label="Loại nội dung">
                {VIEWS.map((v) => (
                    <button key={v.key} role="tab" aria-selected={view === v.key} className="chip" onClick={() => setView(v.key)}>
                        {v.label}
                    </button>
                ))}
                <Link to="/tu-dien" className="more-link cms__dict">
                    Xem từ điển <Icon name="arrow-right" size={14} />
                </Link>
            </div>
            {view === 'lessons' && <LessonsView data={shown} reload={refresh} />}
            {(view === 'vocabulary' || view === 'sentences') && <EntriesView key={view} kind={view} data={shown} reload={refresh} />}
            {view === 'media' && <MediaView />}
        </div>
    );
}
