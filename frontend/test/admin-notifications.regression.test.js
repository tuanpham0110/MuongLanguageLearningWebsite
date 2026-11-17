import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

test('admin sees support notifications after login and shares the count with the inbox', async () => {
    let count = 7;
    let role = 'admin';
    let pollingIndex = 0;
    const h = hookHarness('../../src/layouts/AppLayout.jsx', {
        'react-router-dom': { Link: 'Link', NavLink: 'NavLink', Outlet: 'Outlet', useLocation: () => ({ pathname: '/phong-chat' }) },
        '../services/api.js': { learning: { overview: async () => ({ review: { due: 3 }, stats: {} }) } },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/ui.jsx': { Logo: 'Logo' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { id: 'u', name: 'User', role } }) },
        './nav.js': { NAV_GROUPS: [], NAV_ITEMS: [] },
        '../components/ChatBox.jsx': { __esModule: true, default: 'ChatBox' },
        '../utils/learning.js': { resumeLabel: () => '' },
        '../hooks/usePolling.js': { __esModule: true, default: () => ({ data: { unread: pollingIndex++ % 2 ? count : 0 }, reload() {} }) },
        '../utils/support.js': { SUPPORT_READ_EVENT: 'read' },
        '../context/MessageNotificationsContext.jsx': { useMessageNotifications: () => ({ support: 0, community: 0, admin: count, refresh() {} }) },
        '../components/MessageCenter.jsx': { __esModule: true, default: 'MessageCenter' },
    });
    let tree = h.render();
    const bell = () => nodes(tree, (node) => node.props.className === 'icon-btn')[0];
    assert.equal(nodes(tree, (node) => node.type === 'MessageCenter').length, 1);
    assert.equal(textOf(nodes(tree, (node) => node.props.className?.includes('sidebar__badge'))[0]), '7');
    assert.equal(nodes(tree, (node) => node.type === 'Outlet')[0].props.context.adminUnread, 7);
    count = 0;
    tree = h.render();
    assert.equal(nodes(tree, (node) => node.props.className === 'icon-btn__count').length, 0);
    role = 'user';
    tree = h.render();
    assert.equal(bell().props.to, '/on-luyen');
    assert.equal(nodes(tree, (node) => node.props.className?.includes('sidebar__admin')).length, 0);
    h.unmount();
});

test('admin notice and support tab count remain until the unread count is cleared', () => {
    let unread = 4;
    let selected = new URLSearchParams();
    const h = hookHarness('../../src/pages/Admin.jsx', {
        'react-router-dom': { Navigate: 'Navigate', useOutletContext: () => ({ adminUnread: unread, reloadAdminUnread() {} }), useSearchParams: () => [selected, (next) => { selected = new URLSearchParams(next); }] },
        '../components/ui.jsx': { Button: 'Button', EmptyState: 'EmptyState', ErrorState: 'ErrorState', Skeleton: 'Skeleton', TextField: 'TextField' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/Modal.jsx': { __esModule: true, default: 'Modal' },
        '../components/Conversation.jsx': { __esModule: true, default: 'Conversation' },
        './admin/ContentEditor.jsx': { __esModule: true, default: 'ContentEditor' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { role: 'admin' } }) },
        '../context/ToastContext.jsx': { useToast: () => () => {} },
        '../services/api.js': { admin: {} },
        '../hooks/useAsync.js': { __esModule: true, default: () => ({}) },
        '../hooks/usePolling.js': { __esModule: true, default: () => ({}) },
        '../utils/support.js': {},
        '../utils/format.js': { WEEKDAY: [], formatWhen: () => '' },
    });
    let tree = h.render();
    assert.match(textOf(nodes(tree, (node) => node.props.className === 'adm-notice')[0]), /4 tin nhắn hỗ trợ chưa đọc/);
    const open = nodes(tree, (node) => node.type === 'Button' && textOf(node) === 'Xem tin nhắn')[0];
    open.props.onClick();
    tree = h.render();
    assert.equal(selected.get('tab'), 'support');
    assert.equal(textOf(nodes(tree, (node) => node.props.className === 'count')[0]), '4');
    unread = 0;
    tree = h.render();
    assert.equal(nodes(tree, (node) => node.props.className === 'count').length, 0);
    h.unmount();
});
