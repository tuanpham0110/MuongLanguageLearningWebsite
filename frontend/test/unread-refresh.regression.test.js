import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';
import { messageAttempt } from '../src/utils/messageDelivery.js';
import { mergeCommunity, mergeCommunityMessages, isCommunityUnread } from '../src/utils/community.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const conversationMocks = (acknowledge = () => {}) => ({
    './Icon.jsx': { __esModule: true, default: 'Icon' },
    '../hooks/useVisibleMessageReads.js': { __esModule: true, default: () => acknowledge },
    '../utils/messageDelivery.js': { messageAttempt },
});

test('support and admin dividers reflect current unread messages without remounting', () => {
    for (const admin of [false, true]) {
        const h = hookHarness('../../src/components/Conversation.jsx', conversationMocks());
        const mine = (message) => message.fromAdmin === admin;
        const messages = [{ id: 'incoming', fromAdmin: !admin, read: false, at: 1, body: 'Xin chào' }];
        assert.match(textOf(h.render({ messages, mine })), /1 tin nhắn mới/);
        assert.doesNotMatch(textOf(h.render({ messages: messages.map((m) => ({ ...m, read: true })), mine })), /tin nhắn mới/);
        h.unmount();
    }
});

test('a successful reply acknowledges its loaded incoming snapshot, never newer arrivals or a failed send', async () => {
    const acknowledged = [];
    let resolve, reject;
    const h = hookHarness('../../src/components/Conversation.jsx', conversationMocks((ids) => acknowledged.push([...ids])));
    const props = { messages: [{ id: 'a', at: 1, read: false }, { id: 'own', at: 2, own: true }, { id: 'read', at: 3, read: true }], mine: (m) => !!m.own, onSend: () => new Promise((yes, no) => { resolve = yes; reject = no; }), suggestions: ['Trả lời'] };
    const submit = () => {
        nodes(h.render(props), (n) => n.type === 'textarea')[0].props.onChange({ target: { value: 'Trả lời' } });
        return nodes(h.render(props), (n) => n.type === 'form')[0].props.onSubmit({ preventDefault() {} });
    };
    const failed = submit();
    reject(new Error('offline'));
    await failed;
    assert.deepEqual(acknowledged, []);
    const sent = submit();
    props.messages = [...props.messages, { id: 'new-arrival', at: 4, read: false }];
    h.render(props);
    resolve();
    await sent;
    assert.deepEqual(acknowledged, [['a']]);
    h.unmount();
});

test('refreshing counts or inbox invalidates an older in-flight snapshot immediately', async () => {
    const document = new EventTarget(), window = new EventTarget();
    document.visibilityState = 'visible';
    const timers = new Map(), requests = [];
    let timerId = 0;
    const loader = (signal) => new Promise((resolve) => requests.push({ signal, resolve }));
    const h = hookHarness('../../src/hooks/usePolling.js', {}, {
        document, window, AbortController,
        setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    });
    const options = { restartOnReload: true };
    const polling = h.render(loader, 'default', options);
    polling.reload();
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(requests.length, 2);
    requests[1].resolve({ admin: 0 });
    await flush();
    assert.equal(h.render(loader, 'default', options).data.admin, 0);
    requests[0].resolve({ admin: 5 });
    await flush();
    assert.equal(h.render(loader, 'default', options).data.admin, 0);
    assert.equal(timers.size, 1);
    h.unmount();
});

test('community removes its unread divider after the saved read cursor advances', async () => {
    const before = { unread: 1, lastRead: { position: 1, at: 1, id: 'old' } };
    const after = { unread: 0, lastRead: { position: 2, at: 2, id: 'incoming' } };
    const messages = [{ id: 'incoming', at: 2, position: 2, body: 'Xin chào', author: { id: 'other', name: 'Bạn học', role: 'user' } }];
    let load, confirmed;
    const h = hookHarness('../../src/pages/Community.jsx', {
        'react-router-dom': { Link: 'Link' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/Modal.jsx': { __esModule: true, default: 'Modal' },
        '../components/ui.jsx': { Button: 'Button', ErrorState: 'ErrorState', Skeleton: 'Skeleton' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { id: 'viewer' } }) },
        '../services/api.js': { community: { messages: async () => ({ messages, readState: before }) } },
        '../hooks/usePolling.js': { __esModule: true, default(loader) { load = loader; return { data: { messages, readState: before }, reload() {} }; } },
        '../hooks/useCommunityRead.js': { __esModule: true, default: () => confirmed },
        '../context/MessageNotificationsContext.jsx': { useMessageNotifications: () => ({ community: 1 }), OPEN_COMMUNITY_EVENT: 'open-room' },
        '../components/MessageCenter.jsx': { UnreadBadge: 'UnreadBadge' },
        '../utils/community.js': { isCommunityUnread, mergeCommunity, mergeCommunityMessages },
        '../utils/messageDelivery.js': { messageAttempt },
    });
    h.render();
    await load(new AbortController().signal);
    assert.match(textOf(h.render()), /1 tin nhắn mới/);
    confirmed = after;
    assert.doesNotMatch(textOf(h.render()), /tin nhắn mới/);
    h.unmount();
});
