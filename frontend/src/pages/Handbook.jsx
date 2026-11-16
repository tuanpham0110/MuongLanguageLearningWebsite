import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Skeleton, TextField } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';
import SourceCitation from '../components/SourceCitation.jsx';
import SpeakButton from '../components/learn/SpeakButton.jsx';
import { learning } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import '../styles/resources.css';

const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Public sources stay external; only verified HTTPS addresses become links. */
export function PublicResourceCard({ resource, onRead }) {
    let href = null;
    try {
        const url = new URL(resource.url);
        if (url.protocol === 'https:') href = url.href;
    } catch { /* Invalid source addresses remain visible without a link. */ }

    return (
        <article className="resource-card">
            <div className="resource-card__meta">
                <span className="tag tag--muted">{resource.type}</span>
                <span>{resource.provider}</span>
            </div>
            <h2>{resource.title}</h2>
            <p className="resource-card__description">{resource.description}</p>
            {(resource.dialect || resource.access) && (
                <dl className="resource-card__details">
                    {resource.dialect && <div><dt>Vùng/ngữ liệu</dt><dd>{resource.dialect}</dd></div>}
                    {resource.access && <div><dt>Truy cập</dt><dd>{resource.access}</dd></div>}
                </dl>
            )}
            {resource.steps?.length > 0 && (
                <div className="resource-card__study">
                    <strong>Gợi ý học cùng nguồn này</strong>
                    <ol>{resource.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
                </div>
            )}
            {resource.note && <p className="resource-card__note">{resource.note}</p>}
            <div className="resource-card__actions">
                {href ? (
                    <a className="btn btn--green btn--sm" href={href} target="_blank" rel="noopener noreferrer" aria-label={`Mở học liệu: ${resource.title} (tab mới)`}>
                        Mở học liệu <Icon name="arrow-right" size={16} />
                    </a>
                ) : <span className="muted small">Liên kết đang được cập nhật.</span>}
                {onRead && <Button variant="ghost" size="sm" onClick={onRead}>Đọc bài liên quan</Button>}
            </div>
        </article>
    );
}

function Block({ b, vocabulary, sentences }) {
    if (b.references) return b.references.map((reference) => <SourceCitation key={reference.url} reference={reference} />);
    if (b.p) return <p>{b.p}</p>;
    if (b.h) return <h3>{b.h}</h3>;
    if (b.list)
        return (
            <ul>
                {b.list.map((x) => (
                    <li key={x}>{x}</li>
                ))}
            </ul>
        );
    if (b.vocab) {
        const words = b.vocab === '*' ? vocabulary : vocabulary.filter((v) => v.topic === b.vocab);
        return (
            <table className="vocab">
                <thead>
                    <tr>
                        <th scope="col">Tiếng Mường</th>
                        <th scope="col">Nghĩa</th>
                        <th scope="col">Chủ đề</th>
                    </tr>
                </thead>
                <tbody>
                    {words.map((v) => (
                        <tr key={v.id}>
                            <td className="vocab__word" data-label="Tiếng Mường">
                                <SpeakButton text={v.word} src={v.audioUrl} /> {v.word}
                            </td>
                            <td data-label="Nghĩa">{v.meaning}</td>
                            <td data-label="Chủ đề">
                                <span className="tag tag--muted">{v.topic}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        );
    }
    if (b.sentences)
        return (
            <ul className="sentence-list">
                {sentences.map((s) => (
                    <li key={s.id}>
                        <SpeakButton text={s.text} src={s.audioUrl} />
                        <span>
                            <strong lang="mtq">{s.text}</strong>
                            <small>{s.meaning}</small>
                        </span>
                    </li>
                ))}
            </ul>
        );
    return null;
}

export default function Handbook() {
    const { data, error, loading, reload } = useAsync(() => learning.handbook(), []);
    const [params, setParams] = useSearchParams();
    const [cat, setCat] = useState('Tất cả');
    const [resourceType, setResourceType] = useState('Tất cả');
    const [q, setQ] = useState('');
    const openId = params.get('bai');
    const showingResources = params.get('muc') === 'hoc-lieu';

    const articles = data?.articles ?? [];
    const resources = data?.resources ?? [];
    const cats = useMemo(() => ['Tất cả', ...new Set(articles.map((a) => a.category))], [articles]);
    const resourceTypes = useMemo(() => ['Tất cả', ...new Set(resources.map((r) => r.type))], [resources]);
    const list = articles.filter(
        (a) => (cat === 'Tất cả' || a.category === cat) && (!q || fold(a.title + ' ' + a.excerpt).includes(fold(q)))
    );
    const resourceList = resources.filter((r) =>
        (resourceType === 'Tất cả' || r.type === resourceType) &&
        (!q.trim() || fold([r.title, r.provider, r.description, r.type, r.dialect].join(' ')).includes(fold(q.trim())))
    );
    const open = articles.find((a) => a.id === openId);
    const goBack = () => setParams(showingResources ? { muc: 'hoc-lieu' } : {});
    const changeView = (isResources) => {
        setQ('');
        setParams(isResources ? { muc: 'hoc-lieu' } : {});
    };

    if (open) {
        return (
            <article className="article-page">
                <button className="back-link" onClick={goBack}>
                    <Icon name="arrow-left" size={16} /> {showingResources ? 'Học liệu công khai' : 'Cẩm nang'}
                </button>
                <header>
                    <span className="eyebrow">{open.category}</span>
                    <h1>{open.title}</h1>
                    <p className="article-page__lead">{open.excerpt}</p>
                    <span className="muted small">
                        <Icon name="clock" size={14} /> {open.minutes} phút đọc
                    </span>
                </header>
                <div className="prose">
                    {open.draft ? (
                        <div className="draft-note">
                            <Icon name="clock" size={20} />
                            <p>
                                Nội dung bài viết này đang được đội ngũ chuyên môn biên soạn và xác minh. Chúng tôi chỉ đăng khi nội dung tiếng Mường đã được kiểm chứng.
                            </p>
                        </div>
                    ) : (
                        (open.body ?? []).map((b, i) => <Block key={i} b={b} vocabulary={data.vocabulary ?? []} sentences={data.sentences ?? []} />)
                    )}
                </div>
                <footer className="article-page__foot">
                    <Button variant="light" iconLeft="arrow-left" onClick={goBack}>
                        {showingResources ? 'Trở lại học liệu' : 'Tất cả bài viết'}
                    </Button>
                    <Button to="/bai-hoc" variant="green" iconRight="arrow-right">
                        Vào học
                    </Button>
                </footer>
            </article>
        );
    }

    return (
        <div>
            <header className="page-head">
                <div>
                    <h1>Cẩm nang</h1>
                    <p>Kiến thức tiếng Mường, phương pháp học và học liệu công khai để đọc, nghe, tra cứu thêm.</p>
                </div>
                <TextField className="field--search page-head__search" label={showingResources ? 'Tìm học liệu, tác giả, vùng tiếng' : 'Tìm bài viết'} icon="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            </header>

            <div className="handbook-views" role="group" aria-label="Nội dung cẩm nang">
                <button className="handbook-views__button" aria-pressed={!showingResources} onClick={() => changeView(false)}>
                    <Icon name="guide" size={18} /> Bài viết
                </button>
                <button className="handbook-views__button" aria-pressed={showingResources} onClick={() => changeView(true)}>
                    <Icon name="book" size={18} /> Học liệu công khai
                </button>
            </div>

            {showingResources && (
                <div className="resources-intro">
                    <p>Học cùng video giao tiếp, bản ghi nghiên cứu và tài liệu tra cứu tiếng Mường. Mỗi nguồn có phạm vi ngữ liệu riêng; hãy đọc ghi chú vùng tiếng và đối chiếu cách viết khi học.</p>
                    <span className="muted small">Liên kết mở trang nguồn trong tab mới.</span>
                </div>
            )}

            <div className="chips handbook-filters" role="group" aria-label={showingResources ? 'Lọc theo loại học liệu' : 'Lọc theo chủ đề'}>
                {(showingResources ? resourceTypes : cats).map((c) => (
                    <button key={c} aria-pressed={(showingResources ? resourceType : cat) === c} className="chip" onClick={() => showingResources ? setResourceType(c) : setCat(c)}>
                        {c}
                    </button>
                ))}
            </div>

            {error ? (
                <ErrorState onRetry={reload} />
            ) : loading ? (
                <div className="articles">
                    {[0, 1, 2].map((i) => (
                        <Skeleton key={i} h={96} r={0} style={{ margin: '1px 0' }} />
                    ))}
                </div>
            ) : showingResources ? (
                <section aria-label="Học liệu công khai">
                    <p className="resources-count muted small" role="status">{resourceList.length}/{resources.length} học liệu{q.trim() ? ` phù hợp với “${q.trim()}”` : ''}</p>
                    {resourceList.length === 0 ? (
                        <EmptyState title="Chưa tìm thấy học liệu">Hãy thử loại học liệu hoặc từ khoá khác.</EmptyState>
                    ) : (
                        <div className="resources-grid">
                            {resourceList.map((resource) => (
                                <PublicResourceCard key={resource.id} resource={resource} onRead={articles.some((a) => a.id === resource.relatedArticleId) ? () => setParams({ muc: 'hoc-lieu', bai: resource.relatedArticleId }) : undefined} />
                            ))}
                        </div>
                    )}
                </section>
            ) : list.length === 0 ? (
                <EmptyState title="Chưa có bài viết">Không có bài viết phù hợp. Hãy thử chủ đề hoặc từ khoá khác.</EmptyState>
            ) : (
                <ul className="articles">
                    {list.map((a, i) => (
                        <li key={a.id}>
                            <button className="article" onClick={() => setParams({ bai: a.id })}>
                                <span className="article__idx">{String(i + 1).padStart(2, '0')}</span>
                                <span className="article__main">
                                    <span className="article__cat">
                                        {a.category}
                                        {a.draft && <span className="tag tag--muted tag--xs">Đang biên soạn</span>}
                                    </span>
                                    <strong>{a.title}</strong>
                                    <span className="article__excerpt">{a.excerpt}</span>
                                </span>
                                <span className="article__time">{a.minutes} phút đọc</span>
                                <Icon name="arrow-right" size={18} className="article__go" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
