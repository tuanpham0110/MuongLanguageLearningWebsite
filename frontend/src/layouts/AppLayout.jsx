import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { learning } from '../services/api.js';
import Icon from '../components/Icon.jsx';
import { Logo } from '../components/ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { NAV_GROUPS, NAV_ITEMS } from './nav.js';
import ChatBox from '../components/ChatBox.jsx';
import { resumeLabel } from '../utils/learning.js';
import MessageCenter from '../components/MessageCenter.jsx';
import { useMessageNotifications } from '../context/MessageNotificationsContext.jsx';

function initials(name = '') {
    const parts = name.trim().split(/\s+/);
    return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function UserMenu() {
    const { user, logout } = useAuth();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const { pathname } = useLocation();

    useEffect(() => setOpen(false), [pathname]);

    useEffect(() => {
        if (!open) return;
        const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
        const esc = (e) => e.key === 'Escape' && setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('keydown', esc);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('keydown', esc);
        };
    }, [open]);

    return (
        <div className="user-menu" ref={ref}>
            <button className="user-menu__trigger" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
                <span className="avatar">{initials(user?.name)}</span>
                <span className="user-menu__name">{user?.name}</span>
                <Icon name="chevron-down" size={16} />
            </button>
            {open && (
                <div className="user-menu__pop" role="menu">
                    <div className="user-menu__who">
                        <strong>{user?.name}</strong>
                        <span>{user?.email}</span>
                    </div>
                    <Link role="menuitem" to="/tai-khoan" className="user-menu__item">
                        <Icon name="user" size={18} />
                        Tài khoản
                    </Link>
                    <Link role="menuitem" to="/lich-su" className="user-menu__item">
                        <Icon name="calendar" size={18} />
                        Lịch sử học
                    </Link>
                    <Link role="menuitem" to="/ho-tro" className="user-menu__item">
                        <Icon name="mail" size={18} />
                        Hỗ trợ
                    </Link>
                    {user?.role === 'admin' && (
                        <Link role="menuitem" to="/quan-tri" className="user-menu__item user-menu__item--admin">
                            <Icon name="dashboard" size={18} />
                            Quản trị
                        </Link>
                    )}
                    <button role="menuitem" className="user-menu__item user-menu__item--danger" onClick={logout}>
                        <Icon name="logout" size={18} />
                        Đăng xuất
                    </button>
                </div>
            )}
        </div>
    );
}

export default function AppLayout() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [open, setOpen] = useState(false);
    const [info, setInfo] = useState(null);
    const location = useLocation();
    const notifications = useMessageNotifications();
    const reloadAdminUnread = notifications.refresh;
    useEffect(() => {
        setOpen(false);
        let alive = true;
        learning
            .overview()
            .then((d) => alive && setInfo(d))
            .catch(() => {});
        return () => {
            alive = false;
        };
    }, [location.pathname]);

    const due = info?.review.due ?? 0;
    const adminUnread = isAdmin ? notifications.admin : 0;
    const notificationLabel = due ? `${due} câu đến hạn ôn tập` : 'Không có câu nào cần ôn';
    const badges = { due, support: notifications.support, community: notifications.community };
    const badgeLabel = { due: 'câu đến hạn ôn', support: 'tin nhắn hỗ trợ chưa đọc', community: 'tin nhắn phòng chat chưa đọc' };
    const today = info?.stats.today;
    const focus = info?.resume
        ? { id: info.resume.lessonId, title: info.resume.title, label: resumeLabel(info.resume), pct: (info.resume.done / info.resume.total) * 100, cta: 'Học tiếp' }
        : info?.current
          ? { id: info.current.lesson.id, title: info.current.lesson.title, label: 'Bài tiếp theo', pct: null, cta: 'Bắt đầu' }
          : null;

    return (
        <div className={`app ${open ? 'is-nav-open' : ''}`}>
            <aside className="sidebar" aria-label="Điều hướng ứng dụng">
                <div className="sidebar__brand">
                    <Logo to="/tong-quan" />
                </div>
                <nav className="sidebar__nav">
                    {NAV_GROUPS.map((g) => (
                        <div key={g.key} className="sidebar__group">
                            <span className="sidebar__label">{g.label}</span>
                            {NAV_ITEMS.filter((i) => i.group === g.key).map((item) => (
                                <NavLink key={item.to} to={item.to} className="sidebar__link">
                                    <Icon name={item.icon} size={20} />
                                    <span>{item.label}</span>
                                    {item.badge && badges[item.badge] > 0 && (
                                        <span className={`sidebar__badge ${item.badge !== 'due' ? 'sidebar__badge--message' : ''}`} aria-label={`${badges[item.badge]} ${badgeLabel[item.badge]}`}>
                                            {badges[item.badge] > 99 ? '99+' : badges[item.badge]}
                                        </span>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    ))}
                    {isAdmin && (
                        <NavLink to="/quan-tri" className="sidebar__link sidebar__admin">
                            <Icon name="dashboard" size={20} />
                            <span>Quản trị</span>
                            {adminUnread > 0 && <span className="sidebar__badge sidebar__badge--message" aria-label={`${adminUnread} tin nhắn hỗ trợ chưa đọc`}>{adminUnread > 99 ? '99+' : adminUnread}</span>}
                        </NavLink>
                    )}
                </nav>

                {focus && (
                    <Link to={`/hoc/${focus.id}`} className="side-card" title={focus.label}>
                        <span className="side-card__head">
                            <span className="side-card__label">
                                <Icon name="play" size={12} /> {focus.pct != null ? 'Đang học' : 'Tiếp theo'}
                            </span>
                            <span className="side-card__cta">
                                {focus.cta} <Icon name="arrow-right" size={14} />
                            </span>
                        </span>
                        <strong title={`Bài ${focus.id}: ${focus.title}`}>
                            Bài {focus.id}: {focus.title}
                        </strong>
                        {focus.pct != null && (
                            <span className="side-card__bar">
                                <span style={{ width: `${Math.max(4, focus.pct)}%` }} />
                            </span>
                        )}
                    </Link>
                )}

                {today && (
                    <Link to="/tong-quan" className="side-today" title="Mục tiêu hôm nay">
                        <span className="side-today__row">
                            <span>Hôm nay</span>
                            <b>
                                {Math.min(today.answered, today.goal)}/{today.goal} câu
                            </b>
                        </span>
                        <span className="side-card__bar side-card__bar--today">
                            <span style={{ width: `${Math.min(100, (today.answered / today.goal) * 100)}%` }} />
                        </span>
                        <span className="side-today__streak">
                            <Icon name="flame" size={14} /> {info.stats.streak} ngày liên tiếp
                        </span>
                    </Link>
                )}

                <div className="sidebar__foot" aria-hidden="true">
                    <p>
                        Mỗi ngày 5 phút,
                        <br />
                        giao tiếp được ngay.
                    </p>
                    <img src="/assets/mascot-point.webp" alt="" className="sidebar__mascot" loading="lazy" />
                    <svg className="sidebar__hills" viewBox="0 0 248 90" preserveAspectRatio="none">
                        <path className="sidebar__hill--back" d="M0 52 C40 28 70 30 110 46 S190 26 248 40 V90 H0Z" />
                        <path className="sidebar__hill--middle" d="M0 66 C50 48 96 70 140 60 S210 50 248 62 V90 H0Z" />
                        <path className="sidebar__hill--front" d="M0 80 C60 70 120 86 170 78 S230 74 248 80 V90 H0Z" />
                    </svg>
                </div>
            </aside>
            <div className="app__scrim" onClick={() => setOpen(false)} aria-hidden="true" />

            <div className="app__main">
                <header className="topbar">
                    <button className="topbar__toggle" onClick={() => setOpen(true)} aria-label="Mở menu">
                        <Icon name="menu" size={22} />
                    </button>
                    <div className="topbar__brand">
                        <Logo to="/tong-quan" compact />
                    </div>
                    <div className="topbar__right">
                        <MessageCenter />
                        <Link
                            to="/on-luyen"
                            className="icon-btn"
                            aria-label={notificationLabel}
                            title={notificationLabel}
                        >
                            <Icon name="bell" size={20} />
                            {due > 0 && <span className="icon-btn__count">{due > 99 ? '99+' : due}</span>}
                        </Link>
                        <UserMenu />
                    </div>
                </header>
                <main className="app__content" id="main">
                    <Outlet context={{ adminUnread, reloadAdminUnread }} />
                </main>
            </div>
            <ChatBox floating={location.pathname !== '/phong-chat'} />
        </div>
    );
}
