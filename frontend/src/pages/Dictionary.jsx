import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import AudioPlayer, { VoiceNote } from '../components/learn/AudioPlayer.jsx';
import { content, notebook } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

const DIRS = [
    { key: 'all', label: 'Cả hai chiều' },
    { key: 'mtq', label: 'Mường → Việt' },
    { key: 'vi', label: 'Việt → Mường' },
];
const PAGE = 20;

function Entry({ e, saved, onSave }) {
    const [busy, setBusy] = useState(false);
    return (
        <li className="dict-entry">
            <div className="dict-entry__head">
                <div>
                    <strong className="dict-entry__word" lang="mtq">
                        {e.text}
                    </strong>
                    {e.pronunciation && <span className="dict-entry__pron">/{e.pronunciation}/</span>}
                    {e.approximate && (
                        <span className="tag tag--sand tag--xs" title="Khớp khi bỏ dấu thanh – nghĩa có thể khác">
                            Gần đúng
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    className={`save-btn ${saved ? 'is-saved' : ''}`}
                    disabled={saved || busy}
                    onClick={async () => {
                        setBusy(true);
                        try {
                            await onSave(e);
                        } finally {
                            setBusy(false);
                        }
                    }}
                >
                    <Icon name={saved ? 'bookmark-filled' : 'bookmark'} size={16} />
                    {saved ? 'Đã lưu' : 'Lưu vào sổ tay'}
                </button>
            </div>
            <p className="dict-entry__meaning">{e.meaning}</p>
            <div className="dict-entry__audio">
                <AudioPlayer src={e.audioUrl || undefined} text={e.text} size="sm" label={`Nghe “${e.text}”`} />
                <VoiceNote src={e.audioUrl} />
            </div>
            {e.examples?.length > 0 && (
                <ul className="dict-entry__examples" aria-label="Câu ví dụ">
                    {e.examples.map((x) => (
                        <li key={x.text}>
                            <span lang="mtq">{x.text}</span> <small>{x.meaning}</small>
                        </li>
                    ))}
                </ul>
            )}
            <p className="dict-entry__meta">
                <span>{e.type === 'sentence' ? 'Câu mẫu' : 'Từ'}</span>
                <span>{e.topic}</span>
                {e.dialect && <span>Vùng: {e.dialect}</span>}
                {e.source && <span>Nguồn: {e.source}</span>}
                {e.lesson && (
                    <Link to={`/bai-hoc/${e.lesson.id}`} className="link">
                        Bài {e.lesson.id}: {e.lesson.title}
                    </Link>
                )}
            </p>
            {e.note && <p className="dict-entry__note">{e.note}</p>}
        </li>
    );
}

export default function Dictionary() {
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [q, setQ] = useState(params.get('q') ?? '');
    const dir = DIRS.some((d) => d.key === params.get('dir')) ? params.get('dir') : 'all';
    const [state, setState] = useState({ loading: true, error: null, total: 0, items: [] });
    const [saved, setSaved] = useState(() => new Set());
    const [more, setMore] = useState(false);
    const [retry, setRetry] = useState(0);
    const moreRef = useRef(null);
    const queryRef = useRef('');
    const queryKey = JSON.stringify([q.trim(), dir, retry]);
    queryRef.current = queryKey;

    useEffect(() => {
        notebook.list().then((l) => setSaved(new Set(l.map((n) => n.id)))).catch(() => {});
    }, []);

    // debounced search; the latest query wins
    useEffect(() => {
        const ctrl = new AbortController();
        moreRef.current?.abort();
        moreRef.current = null;
        setMore(false);
        const t = setTimeout(() => {
            setState((s) => ({ ...s, loading: true, error: null }));
            content
                .dictionary({ q: q.trim(), dir, limit: PAGE }, ctrl.signal)
                .then((r) => {
                    if (!ctrl.signal.aborted && queryRef.current === queryKey) setState({ loading: false, error: null, total: r.total, items: r.items });
                })
                .catch((error) => !ctrl.signal.aborted && setState({ loading: false, error, total: 0, items: [] }));
            const next = {};
            if (q.trim()) next.q = q.trim();
            if (dir !== 'all') next.dir = dir;
            setParams(next, { replace: true });
        }, 250);
        return () => {
            clearTimeout(t);
            ctrl.abort();
            moreRef.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [q, dir, retry]);

    async function loadMore() {
        if (moreRef.current || state.loading) return;
        const ctrl = new AbortController();
        moreRef.current = ctrl;
        setMore(true);
        try {
            const r = await content.dictionary({ q: q.trim(), dir, limit: PAGE, offset: state.items.length }, ctrl.signal);
            if (!ctrl.signal.aborted && queryRef.current === queryKey) setState((s) => ({ ...s, items: [...s.items, ...r.items], total: r.total }));
        } catch (e) {
            if (!ctrl.signal.aborted) toast(e.message, { tone: 'error' });
        } finally {
            if (moreRef.current === ctrl) {
                moreRef.current = null;
                setMore(false);
            }
        }
    }

    async function save(e) {
        try {
            await notebook.save({ type: e.type, ref: e.ref });
            setSaved((s) => new Set(s).add(e.id));
            toast('Đã lưu vào sổ tay');
        } catch (er) {
            toast(er.message, { tone: 'error' });
        }
    }

    const setDir = (d) => setParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(d !== 'all' ? { dir: d } : {}) }, { replace: true });

    return (
        <div className="dict">
            <header className="page-head">
                <div>
                    <h1>Từ điển Mường – Việt</h1>
                    <p>Chỉ gồm từ và câu đã được đội ngũ chuyên môn kiểm chứng. Gõ không dấu vẫn tìm được, kết quả khác dấu được đánh dấu “Gần đúng”.</p>
                </div>
            </header>
            <div className="dict__bar">
                <label className="dict__search">
                    <Icon name="search" size={20} />
                    <span className="sr-only">Tìm từ</span>
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nhập từ tiếng Mường hoặc tiếng Việt…" maxLength={100} autoFocus />
                </label>
                <div className="segmented" role="tablist" aria-label="Chiều tra cứu">
                    {DIRS.map((d) => (
                        <button key={d.key} role="tab" aria-selected={dir === d.key} onClick={() => setDir(d.key)}>
                            {d.label}
                        </button>
                    ))}
                </div>
            </div>

            {state.error ? (
                <ErrorState onRetry={() => setRetry((x) => x + 1)}>{state.error.message}</ErrorState>
            ) : state.loading && !state.items.length ? (
                <Skeleton h={220} r={18} />
            ) : state.items.length === 0 ? (
                <EmptyState
                    title={q.trim() ? `Chưa có “${q.trim()}” trong dữ liệu đã kiểm chứng` : 'Từ điển chưa có mục nào'}
                    art="/assets/mascot-book.webp"
                    action={
                        <Button to="/ho-tro" variant="light" iconLeft="mail">
                            Đề xuất bổ sung
                        </Button>
                    }
                >
                    MUONGLAB không tự đoán nghĩa tiếng Mường. Nếu bạn biết từ này từ người bản địa, hãy nhắn cho đội ngũ để được kiểm chứng và bổ sung.
                </EmptyState>
            ) : (
                <>
                    <p className="muted small" aria-live="polite">
                        {state.total} kết quả
                    </p>
                    <ul className="dict__list">
                        {state.items.map((e) => (
                            <Entry key={e.id} e={e} saved={saved.has(e.id)} onSave={save} />
                        ))}
                    </ul>
                    {state.items.length < state.total && (
                        <Button variant="light" onClick={loadMore} loading={more}>
                            Xem thêm
                        </Button>
                    )}
                </>
            )}
        </div>
    );
}
