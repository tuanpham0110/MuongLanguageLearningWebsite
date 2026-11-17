import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { OPEN_COMMUNITY_EVENT, useMessageNotifications } from '../context/MessageNotificationsContext.jsx';

export function UnreadBadge({ count, label = 'tin nhắn chưa đọc' }) {
    return count > 0 ? <span className="message-badge" aria-label={`${count} ${label}`}>{count > 99 ? '99+' : count}</span> : null;
}

export default function MessageCenter({ floating = false }) {
    const { user } = useAuth();
    const counts = useMessageNotifications();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const location = useLocation();
    useEffect(() => setOpen(false), [location.pathname, location.search]);
    useEffect(() => {
        if (!open) return;
        const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
        const key = (event) => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus(); } };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
    }, [open]);
    if (!user) return null;
    const channels = [
        { key: 'community', icon: 'chat', title: 'Phòng chat chung', to: '/phong-chat', note: 'Trao đổi cùng mọi người' },
        { key: 'support', icon: 'mail', title: 'Hỗ trợ của tôi', to: '/ho-tro', note: 'Trò chuyện riêng với quản trị viên' },
        ...(user.role === 'admin' ? [{ key: 'admin', icon: 'dashboard', title: 'Hộp thư quản trị', to: '/quan-tri?tab=support', note: 'Tin nhắn từ người học' }] : []),
    ];
    return <div className={`message-center ${floating ? 'message-center--floating' : ''}`} ref={ref}>
        <button type="button" className="icon-btn message-center__trigger" aria-label={counts.total > 0 ? `Tin nhắn: ${counts.total} chưa đọc` : 'Tin nhắn'} title="Tin nhắn" aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); counts.refresh(); }}>
            <Icon name="chat" size={21} />
            <UnreadBadge count={counts.total} />
        </button>
        {open && <section className="message-center__panel" role="dialog" aria-label="Tin nhắn của bạn">
            <header><div><h2>Tin nhắn</h2><p>{!counts.loaded ? 'Đang tải thông báo…' : counts.total > 0 ? `${counts.total} tin nhắn đang chờ bạn xem` : 'Bạn đã xem hết tin nhắn mới'}</p></div><button type="button" className="icon-btn" aria-label="Đóng danh sách tin nhắn" onClick={() => setOpen(false)}><Icon name="x" size={18} /></button></header>
            {counts.error && <p className="message-center__error" role="status">Chưa cập nhật được thông báo. <button type="button" className="link" onClick={counts.refresh}>Thử lại</button></p>}
            <div className="message-center__channels">{channels.map((channel) => <Link key={channel.key} to={channel.to} className={`message-center__channel ${counts[channel.key] > 0 ? 'is-unread' : ''}`} onClick={() => { setOpen(false); if (channel.key === 'community') window.dispatchEvent(new Event(OPEN_COMMUNITY_EVENT)); }}>
                <span className="message-center__icon"><Icon name={channel.icon} size={21} /></span>
                <span className="message-center__copy"><strong>{channel.title}</strong><small>{counts[channel.key] > 0 ? `${counts[channel.key]} tin nhắn chưa đọc` : channel.note}</small></span>
                <UnreadBadge count={counts[channel.key]} />
                <Icon name="chevron-right" size={15} />
            </Link>)}</div>
        </section>}
    </div>;
}
