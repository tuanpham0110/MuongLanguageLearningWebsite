import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';
import { mergeMessages, mergeThread, SUPPORT_READ_EVENT } from '../src/utils/support.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function browser() {
    const document = new EventTarget();
    document.visibilityState = 'visible';
    const window = new EventTarget();
    const timers = new Map();
    let id = 0;
    return {
        document, window, AbortController, Event,
        setTimeout(fn, delay) { timers.set(++id, { fn, delay }); return id; },
        clearTimeout(key) { timers.delete(key); },
        timers,
        async tick() {
            assert.equal(timers.size, 1);
            const [key, timer] = timers.entries().next().value;
            timers.delete(key);
            timer.fn();
            await flush();
        },
    };
}

test('polling receives new replies without a page reload; never overlaps requests', async () => {
    const b = browser();
    const requests = [];
    const loader = (signal) => {
        const request = { ...deferred(), signal };
        requests.push(request);
        return request.promise;
    };
    const h = hookHarness('../../src/hooks/usePolling.js', {}, b);
    let state = h.render(loader);
    assert.equal(requests.length, 1);
    state.reload();
    b.window.dispatchEvent(new Event('focus'));
    assert.equal(requests.length, 1);
    requests[0].resolve([]);
    await flush();
    assert.equal(h.render(loader).data.length, 0);
    await b.tick();
    assert.equal(requests.length, 2);
    requests[1].resolve([{ id: 'reply', body: 'Admin reply' }]);
    await flush();
    state = h.render(loader);
    assert.equal(state.data[0].body, 'Admin reply');
    assert.equal([...b.timers.values()][0].delay, 3000);
    h.unmount();
    assert.equal(b.timers.size, 0);
});

test('polling recovers from initial failure and preserves loaded messages during later outages', async () => {
    const b = browser();
    let response = () => { throw new Error('offline'); };
    const loader = async () => response();
    const h = hookHarness('../../src/hooks/usePolling.js', {}, b);
    h.render(loader);
    await flush();
    assert.match(h.render(loader).error.message, /offline/);
    response = () => [{ id: 'first' }];
    await b.tick();
    assert.equal(h.render(loader).data[0].id, 'first');
    response = () => { throw new Error('offline again'); };
    await b.tick();
    let state = h.render(loader);
    assert.equal(state.data[0].id, 'first');
    assert.match(state.error.message, /offline again/);
    response = () => [{ id: 'second' }];
    b.window.dispatchEvent(new Event('online'));
    await flush();
    state = h.render(loader);
    assert.equal(state.data[0].id, 'second');
    assert.equal(state.error, null);
    h.unmount();
});

test('hidden tabs cancel requests and resume immediately; late and unmounted responses are ignored', async () => {
    const b = browser();
    const requests = [];
    const loader = (signal) => {
        const r = { ...deferred(), signal };
        requests.push(r);
        return r.promise;
    };
    const h = hookHarness('../../src/hooks/usePolling.js', {}, b);
    h.render(loader);
    b.document.visibilityState = 'hidden';
    b.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(b.timers.size, 0);
    b.window.dispatchEvent(new Event('focus'));
    assert.equal(requests.length, 1);
    b.document.visibilityState = 'visible';
    b.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(requests.length, 2);
    requests[1].resolve(['current']);
    await flush();
    requests[0].resolve(['stale']);
    await flush();
    assert.equal(h.render(loader).data[0], 'current');
    h.render(loader).reload();
    h.unmount();
    assert.equal(requests[2].signal.aborted, true);
    requests[2].resolve(['unmounted']);
    await flush();
    assert.equal(b.timers.size, 0);
    b.window.dispatchEvent(new Event('online'));
    assert.equal(requests.length, 3);
});

test('merging old snapshots cannot erase sent messages, duplicate IDs or undo read receipts', () => {
    const first = { id: 'a', at: 1, read: true, body: 'first' };
    const sent = { id: 'b', at: 2, read: false, body: 'sent' };
    const stale = [{ ...first, read: false }];
    const result = mergeMessages([first, sent], stale);
    assert.deepEqual(result.map((m) => m.id), ['a', 'b']);
    assert.equal(result[0].read, true);
    assert.equal(mergeMessages(result, [sent]).length, 2);
    assert.equal(mergeMessages(null, [sent]).length, 1);
    const thread = mergeThread({ messages: [sent] }, { user: { id: 'u' }, messages: [first] });
    assert.deepEqual(thread.messages.map((m) => m.id), ['a', 'b']);
});

test('suggested support messages share send locking and show failures, then allow retry', async () => {
    const pending = deferred();
    let calls = 0;
    let onSend = () => { calls++; return pending.promise; };
    const props = { messages: [], mine: () => true, onSend: (body) => onSend(body), suggestions: ['Need help'] };
    const h = hookHarness('../../src/components/Conversation.jsx', {
        './Icon.jsx': { __esModule: true, default: 'Icon' },
    });
    let tree = h.render(props);
    const button = nodes(tree, (n) => n.type === 'button' && textOf(n) === 'Need help')[0];
    const first = button.props.onClick({ preventDefault() {} });
    await button.props.onClick({ preventDefault() {} });
    assert.equal(calls, 1);
    tree = h.render(props);
    assert.equal(nodes(tree, (n) => n.type === 'textarea')[0].props.disabled, true);
    pending.reject(new Error('Cannot send'));
    await first;
    tree = h.render(props);
    assert.match(textOf(tree), /Cannot send/);
    onSend = async (body) => { calls++; assert.equal(body, 'Need help'); };
    await nodes(tree, (n) => n.type === 'button' && textOf(n) === 'Need help')[0].props.onClick({ preventDefault() {} });
    assert.equal(calls, 2);
    assert.doesNotMatch(textOf(h.render(props)), /Cannot send/);
    h.unmount();
});

test('learner refresh notifies unread badge and POST response merges with existing replies', async () => {
    const b = browser();
    let notified = 0, load, options;
    let data = [{ id: 'admin', at: 1, fromAdmin: true }];
    b.window.addEventListener(SUPPORT_READ_EVENT, () => notified++);
    const h = hookHarness('../../src/pages/Support.jsx', {
        '../components/ui.jsx': { ErrorState: 'ErrorState', Skeleton: 'Skeleton' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/Conversation.jsx': { __esModule: true, default: 'Conversation' },
        '../services/api.js': { support: {
            thread: async () => data,
            send: async () => ({ id: 'sent', at: 2, fromAdmin: false }),
        } },
        '../hooks/useMeta.js': { __esModule: true, default: () => null },
        '../hooks/usePolling.js': { __esModule: true, default: (loader, opts) => {
            load = loader; options = opts;
            return { data, reload() {}, setData(update) { data = update(data); } };
        } },
        '../utils/support.js': { mergeMessages, SUPPORT_READ_EVENT },
        '../context/MessageNotificationsContext.jsx': { useMessageNotifications: () => ({ support: 0 }) },
        '../components/MessageCenter.jsx': { UnreadBadge: 'UnreadBadge' },
    }, b);
    let tree = h.render({});
    await load(new AbortController().signal);
    assert.equal(notified, 1);
    assert.equal(options.merge, mergeMessages);
    await nodes(tree, (n) => n.type === 'Conversation')[0].props.onSend('hello');
    tree = h.render({});
    assert.deepEqual(nodes(tree, (n) => n.type === 'Conversation')[0].props.messages.map((m) => m.id), ['admin', 'sent']);
    h.unmount();
});

test('sidebar renders the shared support count and clears it when notifications refresh', async () => {
    const b = browser();
    let unread = 2, reloads = 0;
    const reload = () => { unread = 0; reloads++; };
    const h = hookHarness('../../src/layouts/AppLayout.jsx', {
        'react-router-dom': { Link: 'Link', NavLink: 'NavLink', Outlet: 'Outlet', useLocation: () => ({ pathname: '/tong-quan' }) },
        '../services/api.js': { learning: { overview: async () => ({ stats: {}, review: { due: 0 }, support: { unread: 99 } }) }, support: {} },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/ui.jsx': { Logo: 'Logo' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { name: 'Learner' } }) },
        './nav.js': { NAV_GROUPS: [{ key: 'ref' }], NAV_ITEMS: [{ to: '/ho-tro', group: 'ref', badge: 'support' }] },
        '../components/ChatBox.jsx': { __esModule: true, default: 'ChatBox' },
        '../utils/learning.js': { resumeLabel: () => '' },
        '../hooks/usePolling.js': { __esModule: true, default: () => ({ data: { unread }, reload }) },
        '../utils/support.js': { SUPPORT_READ_EVENT },
        '../context/MessageNotificationsContext.jsx': { useMessageNotifications: () => ({ support: unread, community: 0, admin: 0, refresh: reload }) },
        '../components/MessageCenter.jsx': { __esModule: true, default: 'MessageCenter' },
    }, b);
    h.render({});
    await flush();
    let tree = h.render({});
    assert.equal(textOf(nodes(tree, (n) => n.props.className?.includes('sidebar__badge'))[0]), '2');
    reload();
    tree = h.render({});
    assert.equal(reloads, 1);
    assert.equal(nodes(tree, (n) => n.props.className?.includes('sidebar__badge')).length, 0);
    h.unmount();
    b.window.dispatchEvent(new Event(SUPPORT_READ_EVENT));
    assert.equal(reloads, 1);
});

test('admin selection remounts each conversation; a late send cannot change the newly selected thread', async () => {
    const pending = deferred();
    const states = new Map();
    let selected = 'A';
    const h = hookHarness('../../src/pages/Admin.jsx', {
        'react-router-dom': { Navigate: 'Navigate', useOutletContext: () => ({ adminUnread: 0, reloadAdminUnread() {} }), useSearchParams: () => [new URLSearchParams({ tab: 'support', user: selected }), () => {}] },
        '../components/ui.jsx': { Button: 'Button', EmptyState: 'EmptyState', ErrorState: 'ErrorState', Skeleton: 'Skeleton', TextField: 'TextField' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/Modal.jsx': { __esModule: true, default: 'Modal' },
        '../components/Conversation.jsx': { __esModule: true, default: 'Conversation' },
        './admin/ContentEditor.jsx': { __esModule: true, default: 'ContentEditor' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { role: 'admin' } }) },
        '../context/ToastContext.jsx': { useToast: () => () => {} },
        '../services/api.js': { admin: { reply: (id) => { assert.equal(id, 'A'); return pending.promise; } } },
        '../hooks/useAsync.js': { __esModule: true, default: () => ({}) },
        '../hooks/usePolling.js': { __esModule: true, default: (_loader, options) => {
            if (options?.interval === 5000) return { data: [], reload() {} };
            const id = selected;
            if (!states.has(id)) states.set(id, { user: { id, name: id, createdAt: 0 }, messages: [] });
            return { data: states.get(id), reload() {}, setData(update) { states.set(id, update(states.get(id))); } };
        } },
        '../utils/support.js': { mergeMessages, mergeThread },
        '../utils/format.js': { WEEKDAY: [], formatWhen: () => '' },
    });
    const inboxNode = nodes(h.render({}), (n) => typeof n.type === 'function')[0];
    const inboxTree = h.render(inboxNode.props, inboxNode.type);
    const threadA = nodes(inboxTree, (n) => typeof n.type === 'function')[0];
    assert.equal(threadA.key, 'A');
    let tree = h.render(threadA.props, threadA.type);
    const sending = nodes(tree, (n) => n.type === 'Conversation')[0].props.onSend('reply to A');
    selected = 'B';
    const nextInbox = h.render({ openId: 'B', onOpen() {} }, inboxNode.type);
    const threadB = nodes(nextInbox, (n) => typeof n.type === 'function')[0];
    assert.equal(threadB.key, 'B');
    h.render(threadB.props, threadB.type);
    pending.resolve({ id: 'reply-A', at: 1, body: 'reply to A' });
    await sending;
    assert.equal(states.get('A').messages[0].id, 'reply-A');
    assert.equal(states.get('B').messages.length, 0);
    h.unmount();
});
