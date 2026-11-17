import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

test('message center separates channels and opening its list never clears unread counts', () => {
    let refreshes = 0;
    const counts = { community: 8, support: 2, admin: 4, total: 14, loaded: true, refresh() { refreshes++; } };
    const document = new EventTarget();
    const window = new EventTarget();
    const h = hookHarness('../../src/components/MessageCenter.jsx', {
        'react-router-dom': { Link: 'Link', useLocation: () => ({ pathname: '/phong-chat', search: '' }) },
        './Icon.jsx': { __esModule: true, default: 'Icon' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { id: 'admin', role: 'admin' } }) },
        '../context/MessageNotificationsContext.jsx': { useMessageNotifications: () => counts, OPEN_COMMUNITY_EVENT: 'open-room' },
    }, { document, window });
    let tree = h.render({});
    nodes(tree, (node) => node.props.className?.includes('message-center__trigger'))[0].props.onClick();
    tree = h.render({});
    assert.equal(refreshes, 1);
    const links = nodes(tree, (node) => node.type === 'Link');
    assert.deepEqual(links.map((node) => node.props.to), ['/phong-chat', '/ho-tro', '/quan-tri?tab=support']);
    assert.match(textOf(links[0]), /8 tin nhắn chưa đọc/);
    assert.match(textOf(links[1]), /2 tin nhắn chưa đọc/);
    assert.match(textOf(links[2]), /4 tin nhắn chưa đọc/);
    assert.equal(counts.total, 14);
    links[1].props.onClick();
    assert.equal(nodes(h.render({}), (node) => node.props.role === 'dialog').length, 0);
    assert.equal(counts.total, 14);
    assert.equal(textOf(h.render({ count: 120 }, 'UnreadBadge')), '99+');
    assert.equal(h.render({ count: 0 }, 'UnreadBadge'), null);
    h.unmount();
});

test('the notification provider refreshes on support/community reads and removes listeners on unmount', () => {
    const document = new EventTarget();
    const window = new EventTarget();
    let reloads = 0;
    const h = hookHarness('../../src/context/MessageNotificationsContext.jsx', {
        './AuthContext.jsx': { useAuth: () => ({ user: { id: 'u', role: 'user' } }) },
        '../services/api.js': { messages: {} },
        '../hooks/usePolling.js': { __esModule: true, default: () => ({ data: { community: 3, support: 1, admin: 0, total: 4 }, reload() { reloads++; } }) },
        '../utils/support.js': { SUPPORT_READ_EVENT: 'support-read' },
    }, { document, window });
    const provider = h.render({ children: 'child' }, 'MessageNotificationsProvider');
    const value = h.render(provider.props, provider.type).props.value;
    assert.equal(value.total, 4);
    window.dispatchEvent(new Event('support-read'));
    window.dispatchEvent(new Event('muonglab:messages-changed'));
    assert.equal(reloads, 2);
    h.unmount();
    window.dispatchEvent(new Event('support-read'));
    assert.equal(reloads, 2);
});

test('community marks read only while focused, visible, at the bottom and on screen', async () => {
    const document = new EventTarget();
    const window = new EventTarget();
    let focused = false, bottom = 500;
    document.visibilityState = 'visible';
    document.hasFocus = () => focused;
    window.innerHeight = 800;
    const frames = new Map();
    let frameId = 0, notified = 0;
    const requests = [];
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    const animate = async () => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(); await flush(); };
    const listRef = { current: { getBoundingClientRect: () => ({ top: 100, bottom: 600 }), querySelector: () => ({ getBoundingClientRect: () => ({ bottom }) }) } };
    const nearBottom = { current: true };
    const h = hookHarness('../../src/hooks/useCommunityRead.js', {
        '../services/api.js': { community: { markRead(id, signal) { let resolve; const promise = new Promise((yes) => { resolve = yes; }); requests.push({ id, signal, resolve }); return promise; } } },
        '../context/MessageNotificationsContext.jsx': { notifyMessagesChanged() { notified++; } },
    }, { document, window, AbortController, requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); } });
    h.render({ messages: [{ id: 'm1' }], listRef, nearBottom });
    await animate();
    assert.equal(requests.length, 0);
    focused = true;
    document.visibilityState = 'hidden';
    window.dispatchEvent(new Event('focus'));
    await animate();
    assert.equal(requests.length, 0);
    document.visibilityState = 'visible';
    nearBottom.current = false;
    window.dispatchEvent(new Event('scroll'));
    await animate();
    assert.equal(requests.length, 0);
    nearBottom.current = true;
    bottom = 900;
    window.dispatchEvent(new Event('scroll'));
    await animate();
    assert.equal(requests.length, 0);
    bottom = 500;
    window.dispatchEvent(new Event('scroll'));
    await animate();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].id, 'm1');
    h.render({ messages: [{ id: 'm1' }, { id: 'm2' }], listRef, nearBottom });
    await animate();
    assert.equal(requests.length, 1, 'never overlaps acknowledgements');
    requests[0].resolve({ unread: 1 });
    await flush();
    await animate();
    assert.equal(requests[1].id, 'm2');
    assert.equal(notified, 1);
    h.unmount();
    assert.equal(requests[1].signal.aborted, true);
    requests[1].resolve({ unread: 0 });
    await flush();
    assert.equal(notified, 1);
});
