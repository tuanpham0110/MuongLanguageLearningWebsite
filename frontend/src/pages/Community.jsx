import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { Button, ErrorState, Skeleton } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { community } from '../services/api.js';
import usePolling from '../hooks/usePolling.js';
import { isCommunityUnread, mergeCommunity, mergeCommunityMessages } from '../utils/community.js';
import useCommunityRead from '../hooks/useCommunityRead.js';
import { OPEN_COMMUNITY_EVENT, useMessageNotifications } from '../context/MessageNotificationsContext.jsx';
import { UnreadBadge } from '../components/MessageCenter.jsx';

const dateOf = (at) => new Date(at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const timeOf = (at) => new Date(at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const initials = (name) => name.trim().split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase();
const TOPICS = ['Mọi người có mẹo ghi nhớ từ vựng tiếng Mường không?', 'Mình muốn tìm bạn cùng luyện hội thoại.', 'Mình cần hỏi cách phát âm một từ trong bài học.'];

export default function Community() {
    const { user } = useAuth();
    const syncRef = useRef();
    const afterRef = useRef();
    const listRef = useRef(null);
    const inputRef = useRef(null);
    const sendLock = useRef(false);
    const nearBottom = useRef(true);
    const olderScroll = useRef(null);
    const historyController = useRef(null);
    const lastMessage = useRef(null);
    const initialRead = useRef(null);
    const notifications = useMessageNotifications();
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [historyError, setHistoryError] = useState('');
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [toRemove, setToRemove] = useState(null);
    const [removing, setRemoving] = useState(false);
    const [removeError, setRemoveError] = useState('');

    const { data, loading, error, reload, setData } = usePolling(async (signal) => {
        let result = await community.messages({ after: afterRef.current, since: syncRef.current, signal });
        let next = result.nextAfter;
        while (next && !signal.aborted) {
            const page = await community.messages({ after: next, since: syncRef.current, signal });
            result = { ...result, latestCursor: page.latestCursor, messages: [...result.messages, ...page.messages], removedIds: [...result.removedIds, ...page.removedIds] };
            next = page.nextAfter;
        }
        if (!signal.aborted) {
            if (!initialRead.current && result.readState) initialRead.current = result.readState;
            syncRef.current = result.syncedAt;
            afterRef.current = result.latestCursor ?? afterRef.current;
        }
        return result;
    }, { interval: 4000, merge: mergeCommunity });

    useCommunityRead({ messages: data?.messages, listRef, nearBottom });
    useEffect(() => {
        const latest = () => {
            const list = listRef.current;
            if (!list) return;
            list.scrollIntoView({ block: 'nearest' });
            list.scrollTop = list.scrollHeight;
            nearBottom.current = true;
            setShowNew(false);
            window.dispatchEvent(new Event('scroll'));
        };
        window.addEventListener(OPEN_COMMUNITY_EVENT, latest);
        return () => window.removeEventListener(OPEN_COMMUNITY_EVENT, latest);
    }, []);

    useEffect(() => () => historyController.current?.abort(), []);
    useEffect(() => {
        const list = listRef.current;
        if (!list || !data) return;
        if (olderScroll.current) {
            list.scrollTop = olderScroll.current.top + list.scrollHeight - olderScroll.current.height;
            olderScroll.current = null;
        } else if (nearBottom.current) {
            list.scrollTop = list.scrollHeight;
            setShowNew(false);
        } else if (lastMessage.current && lastMessage.current !== data.messages.at(-1)?.id) {
            setShowNew(true);
        }
        lastMessage.current = data.messages.at(-1)?.id;
    }, [data?.messages]);

    async function send(event) {
        event?.preventDefault();
        const body = text.trim();
        if (!body || body.length > 2000 || sendLock.current || !data) return;
        sendLock.current = true;
        setSending(true);
        setSendError('');
        try {
            const message = await community.send(body);
            nearBottom.current = true;
            setData((current) => ({ ...current, messages: mergeCommunityMessages(current?.messages, [message]) }));
            setText('');
            reload();
        } catch (err) {
            setSendError(err.message || 'Chưa gửi được tin nhắn. Bạn có thể thử lại.');
        } finally {
            sendLock.current = false;
            setSending(false);
        }
    }

    async function loadOlder() {
        if (!data?.nextBefore || historyController.current) return;
        const controller = new AbortController();
        historyController.current = controller;
        setLoadingOlder(true);
        setHistoryError('');
        try {
            const page = await community.messages({ before: data.nextBefore, signal: controller.signal });
            if (controller.signal.aborted) return;
            const list = listRef.current;
            olderScroll.current = { top: list.scrollTop, height: list.scrollHeight };
            setData((current) => ({ ...current, nextBefore: page.nextBefore, messages: mergeCommunityMessages(current?.messages, page.messages, page.removedIds) }));
        } catch (err) {
            if (!controller.signal.aborted) setHistoryError(err.message);
        } finally {
            if (historyController.current === controller) historyController.current = null;
            if (!controller.signal.aborted) setLoadingOlder(false);
        }
    }

    async function remove() {
        if (removing || !toRemove) return;
        setRemoving(true);
        setRemoveError('');
        try {
            const message = await community.remove(toRemove.id);
            setData((current) => ({ ...current, messages: mergeCommunityMessages(current?.messages, [message]) }));
            setToRemove(null);
            reload();
        } catch (err) {
            setRemoveError(err.message);
        } finally {
            setRemoving(false);
        }
    }

    function suggest(topic) {
        setText(topic);
        inputRef.current?.focus();
    }

    let lastDay = '';
    const firstUnread = initialRead.current?.unread > 0 ? data?.messages.find((message) => isCommunityUnread(message, initialRead.current.lastRead, user.id))?.id : null;
    return (
        <div className="community">
            <header className="page-head">
                <div><h1>Phòng chat chung</h1><p>Cùng hỏi, cùng chia sẻ và học tiếng Mường mỗi ngày.</p></div>
                <span className={`community__status ${error ? 'is-offline' : ''}`}><span />{error ? 'Đang kết nối lại' : loading ? 'Đang kết nối' : 'Tự động cập nhật'}</span>
            </header>
            <div className="community__layout">
                <section className="panel community__room" aria-label="Phòng trò chuyện cộng đồng">
                    <header className="community__head">
                        <span className="community__room-icon"><Icon name="chat" size={24} /></span>
                        <div><h2>Cộng đồng MUONGLAB <UnreadBadge count={notifications.community} /></h2><p>Một góc nhỏ để cùng nhau tiến bộ</p></div>
                    </header>
                    {error && data && <p className="convo__error" role="status">Chưa cập nhật được tin mới. Đang tự kết nối lại… <button type="button" className="link" onClick={reload}>Thử lại</button></p>}
                    {error && !data ? <ErrorState onRetry={reload}>{error.message}</ErrorState> : (
                        <>
                            <div className="community__messages" ref={listRef} role="log" aria-label="Tin nhắn phòng chat" aria-live="polite" aria-relevant="additions text" aria-busy={loading && !data} onScroll={() => {
                                const list = listRef.current;
                                nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
                                if (nearBottom.current) setShowNew(false);
                            }}>
                                {loading && !data ? <div className="support__loading"><Skeleton h={60} w="70%" /><Skeleton h={60} w="60%" /></div> : <>
                                    {data?.nextBefore && <button type="button" className="community__older" onClick={loadOlder} disabled={loadingOlder}>{loadingOlder ? 'Đang tải…' : 'Xem tin nhắn cũ hơn'}</button>}
                                    {historyError && <p className="convo__error" role="alert">{historyError}</p>}
                                    {data?.messages.length === 0 && <div className="community__empty"><img src="/assets/mascot-point.webp" alt="" /><h3>Bắt đầu một cuộc trò chuyện nhé!</h3><p>Chào mọi người, đặt câu hỏi hoặc chia sẻ điều bạn vừa học được.</p><div className="support__topics">{TOPICS.slice(0, 2).map((topic) => <button type="button" key={topic} onClick={() => suggest(topic)}>{topic}</button>)}</div></div>}
                                    {data?.messages.map((message) => {
                                        const day = dateOf(message.at);
                                        const showDay = day !== lastDay;
                                        lastDay = day;
                                        const own = message.author.id === user.id;
                                        return <div className="community__item" key={message.id}>
                                            {showDay && <p className="convo__day">{day}</p>}
                                            {message.id === firstUnread && <p className="convo__unread">{initialRead.current.unread} tin nhắn mới</p>}
                                            <article data-message-id={message.id} className={`community__message ${own ? 'is-mine' : ''} ${message.deleted ? 'is-deleted' : ''}`} aria-label={`Tin nhắn của ${message.author.name}`}>
                                                <span className="avatar community__avatar" aria-hidden="true">{initials(message.author.name)}</span>
                                                <div className="community__message-main">
                                                    <div className="community__byline"><strong>{own ? 'Bạn' : message.author.name}</strong>{message.author.role === 'admin' && <span className="community__admin">Quản trị viên</span>}<time dateTime={new Date(message.at).toISOString()} title={new Date(message.at).toLocaleString('vi-VN')}>{timeOf(message.at)}</time></div>
                                                    <p className="community__bubble">{message.deleted ? 'Tin nhắn đã được gỡ.' : message.body}</p>
                                                </div>
                                                {!message.deleted && (own || user.role === 'admin') && <button type="button" className="community__remove" title="Gỡ tin nhắn" aria-label={`Gỡ tin nhắn của ${message.author.name}`} onClick={() => { setToRemove(message); setRemoveError(''); }}><Icon name="trash" size={16} /></button>}
                                            </article>
                                        </div>;
                                    })}
                                </>}
                            </div>
                            {showNew && <button type="button" className="community__jump" onClick={() => { listRef.current.scrollTop = listRef.current.scrollHeight; nearBottom.current = true; setShowNew(false); window.dispatchEvent(new Event('scroll')); }}><Icon name="arrow-down" size={16} /> Xuống tin mới <UnreadBadge count={notifications.community} /></button>}
                        </>
                    )}
                    {sendError && <p className="convo__error" role="alert">{sendError}</p>}
                    <form className="community__composer" onSubmit={send}>
                        <div className="convo__form">
                            <textarea ref={inputRef} rows={2} maxLength={2000} value={text} disabled={sending || !data} placeholder="Chia sẻ hoặc đặt câu hỏi với mọi người…" aria-label="Tin nhắn phòng chat" onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event); }} />
                            <button type="submit" className="convo__send" disabled={!text.trim() || sending || !data} aria-label="Gửi vào phòng chat"><Icon name="arrow-right" size={20} /></button>
                        </div>
                        <div className="community__composer-help"><span>Enter để gửi · Shift + Enter để xuống dòng</span><span>{text.length}/2000</span></div>
                    </form>
                </section>
                <aside className="community__side">
                    <section className="panel community__welcome"><span className="community__eyebrow">CÙNG NHAU HỌC TỐT HƠN</span><h2>Mỗi câu hỏi đều mở đầu một điều mới.</h2><p>Hỏi điều bạn chưa rõ, kể một trải nghiệm hay chia sẻ mẹo học hữu ích với mọi người.</p><Icon name="chat" size={44} /></section>
                    <section className="panel support__card"><h2><Icon name="heart" size={18} /> Một cộng đồng thân thiện</h2><ul><li>Tôn trọng nhau và cùng tập trung vào việc học.</li><li>Nêu rõ bài học, từ hoặc câu bạn muốn hỏi.</li><li>Không đăng thông tin riêng tư hay quảng cáo.</li></ul><p className="community__privacy">Mọi thành viên đăng nhập đều xem được tin nhắn tại đây.</p></section>
                    <section className="panel support__card"><h2><Icon name="bulb" size={18} /> Gợi ý bắt chuyện</h2><div className="community__suggestions">{TOPICS.map((topic) => <button type="button" key={topic} disabled={sending} onClick={() => suggest(topic)}>{topic}<Icon name="arrow-right" size={15} /></button>)}</div></section>
                    <p className="community__support">Cần trợ giúp riêng về tài khoản? <Link to="/ho-tro">Nhắn cho quản trị viên <UnreadBadge count={notifications.support} /><Icon name="arrow-right" size={14} /></Link></p>
                </aside>
            </div>
            <Modal open={!!toRemove} onClose={() => !removing && setToRemove(null)} title="Gỡ tin nhắn?" footer={<><Button variant="light" onClick={() => setToRemove(null)} disabled={removing}>Huỷ</Button><Button variant="green" onClick={remove} loading={removing}>Gỡ tin nhắn</Button></>}><p>Tin nhắn này sẽ được gỡ khỏi phòng chat cho mọi người.</p>{removeError && <p className="convo__error" role="alert">{removeError}</p>}</Modal>
        </div>
    );
}
