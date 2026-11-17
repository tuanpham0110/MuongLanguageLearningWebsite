import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import useVisibleMessageReads from '../hooks/useVisibleMessageReads.js';
import { messageAttempt } from '../utils/messageDelivery.js';

const DAY = 86400000;
const startOfDay = (t) => new Date(t).setHours(0, 0, 0, 0);

function dayLabel(ts) {
    const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
    if (diff === 0) return 'Hôm nay';
    if (diff === 1) return 'Hôm qua';
    return new Date(ts).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const timeOf = (ts) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Message thread + composer shared by the learner's support page and the admin inbox.
 * `mine(m)` tells which side of the conversation the viewer is on.
 */
export default function Conversation({ messages, mine, onSend, onRead, placeholder = 'Nhập tin nhắn…', empty, otherLabel, suggestions = [] }) {
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const listRef = useRef(null);
    const sendingRef = useRef(false);
    const attemptRef = useRef(null);
    const positioned = useRef(false);
    const nearBottom = useRef(true);
    const forceBottom = useRef(false);
    const lastId = useRef(null);
    const [showNew, setShowNew] = useState(false);
    const firstUnread = useRef(null);
    const unread = messages.filter((m) => !mine(m) && !m.read);
    if (!firstUnread.current && unread.length) {
        firstUnread.current = { id: unread[0].id, count: unread.length };
    }

    const acknowledgeReply = useVisibleMessageReads({ messages, mine, onRead, listRef });

    useEffect(() => {
        const el = listRef.current;
        if (!el || !messages.length) return;
        if (!positioned.current) {
            const first = firstUnread.current && el.querySelector(`[data-support-message-id="${firstUnread.current.id}"]`);
            if (first) el.scrollTop += first.getBoundingClientRect().top - el.getBoundingClientRect().top - 12;
            else el.scrollTop = el.scrollHeight;
            positioned.current = true;
            nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
        } else if (forceBottom.current || (nearBottom.current && document.visibilityState !== 'hidden' && document.hasFocus())) {
            el.scrollTop = el.scrollHeight;
            setShowNew(false);
        } else if (lastId.current !== messages.at(-1)?.id) setShowNew(true);
        forceBottom.current = false;
        lastId.current = messages.at(-1)?.id;
    }, [messages, sending]);

    async function submit(e, suggestedText) {
        e?.preventDefault();
        const body = (suggestedText ?? text).trim();
        if (!body || sendingRef.current) return;
        const repliedIds = unread.map((message) => message.id);
        sendingRef.current = true;
        setSending(true);
        setError('');
        attemptRef.current = messageAttempt(attemptRef.current, body);
        try {
            await onSend(body, attemptRef.current.clientMessageId);
            attemptRef.current = null;
            acknowledgeReply?.(repliedIds);
            forceBottom.current = true;
            if (listRef.current) { listRef.current.scrollTop = listRef.current.scrollHeight; nearBottom.current = true; }
            if (suggestedText === undefined) setText('');
        } catch (err) {
            setError(err.message || 'Không gửi được tin nhắn. Vui lòng thử lại.');
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    }

    let lastDay = null;
    return (
        <div className="convo">
            <div className="convo__list" ref={listRef} aria-live="polite" onScroll={() => {
                const list = listRef.current;
                nearBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 32;
                if (nearBottom.current) setShowNew(false);
            }}>
                {messages.length === 0 && <div className="convo__empty">
                    {empty}
                    {suggestions.length > 0 && <div className="support__topics">
                        {suggestions.map((topic) => <button key={topic} type="button" disabled={sending} onClick={(e) => submit(e, topic)}>{topic}</button>)}
                    </div>}
                </div>}
                {messages.map((m) => {
                    const day = startOfDay(m.at);
                    const showDay = day !== lastDay;
                    lastDay = day;
                    const own = mine(m);
                    return (
                        <div key={m.id} className="convo__item">
                            {showDay && <p className="convo__day">{dayLabel(m.at)}</p>}
                            {unread[0]?.id === m.id && <p className="convo__unread">{unread.length} tin nhắn mới</p>}
                            <div data-support-message-id={m.id} className={`convo__msg ${own ? 'is-mine' : ''}`}>
                                <div className="convo__bubble">{m.body}</div>
                                <small>
                                    {!own && otherLabel ? `${otherLabel} · ` : ''}
                                    {timeOf(m.at)}
                                    {own && m.read ? ' · Đã xem' : ''}
                                </small>
                            </div>
                        </div>
                    );
                })}
            </div>
            {showNew && <button type="button" className="convo__jump" onClick={() => {
                listRef.current.scrollTop = listRef.current.scrollHeight;
                nearBottom.current = true;
                setShowNew(false);
                window.dispatchEvent(new Event('scroll'));
            }}><Icon name="arrow-down" size={15} /> Xuống tin mới</button>}
            {error && (
                <p className="convo__error" role="alert">
                    <Icon name="alert" size={14} /> {error}
                </p>
            )}
            <form className="convo__form" onSubmit={submit}>
                <textarea
                    rows={2}
                    value={text}
                    maxLength={2000}
                    disabled={sending}
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
                    }}
                />
                <button type="submit" className="convo__send" disabled={!text.trim() || sending} aria-label="Gửi tin nhắn">
                    <Icon name="arrow-right" size={18} />
                </button>
            </form>
        </div>
    );
}
