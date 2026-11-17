import test from 'node:test';
import assert from 'node:assert/strict';
import { isCommunityUnread, mergeCommunity, mergeCommunityMessages } from '../src/utils/community.js';
import { hookHarness, nodes } from './helpers/hooks.js';
import { messageAttempt } from '../src/utils/messageDelivery.js';

const message = (id, at, body = id) => ({ id, at, body, deleted: false, author: { id: 'user1', name: 'Người học', role: 'user' } });

test('chat merges stale snapshots, catch-up pages and POST responses without duplicates or lost sends', () => {
    const a = message('a', 1), b = message('b', 2), c = message('c', 2);
    const sent = mergeCommunityMessages([a], [c]);
    const result = mergeCommunityMessages(sent, [a, b]);
    assert.deepEqual(result.map((item) => item.id), ['a', 'b', 'c']);
    assert.deepEqual(mergeCommunityMessages(result, [c]), result);
});

test('removed messages never return with old text, including deletion of older loaded history', () => {
    const deleted = mergeCommunityMessages([message('old', 1)], [], ['old']);
    assert.equal(deleted[0].body, '');
    assert.equal(deleted[0].deleted, true);
    assert.equal(mergeCommunityMessages(deleted, [message('old', 1)])[0].body, '');
    assert.equal(mergeCommunityMessages([message('old', 1)], [{ ...message('old', 1), deleted: true }])[0].body, '');
});

test('live updates preserve the oldest loaded history cursor', () => {
    const page = { messages: [message('a', 1)], nextBefore: '0_a', removedIds: [], readState: { unread: 1, lastRead: null } };
    assert.equal(mergeCommunity(null, page).nextBefore, '0_a');
    const next = mergeCommunity(page, { messages: [message('b', 2)], nextBefore: null, removedIds: [] });
    assert.equal(next.nextBefore, '0_a');
    assert.deepEqual(next.readState, page.readState);
    assert.deepEqual(next.messages.map((item) => item.id), ['a', 'b']);
    assert.equal(mergeCommunity({ ...next, nextBefore: null }, page).nextBefore, null);
});

test('failed chat sends keep the draft and duplicate submits share one in-flight request', async () => {
    let reject;
    let calls = 0;
    const pending = new Promise((_resolve, no) => { reject = no; });
    const h = hookHarness('../../src/pages/Community.jsx', {
        'react-router-dom': { Link: 'Link' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/Modal.jsx': { __esModule: true, default: 'Modal' },
        '../components/ui.jsx': { Button: 'Button', ErrorState: 'ErrorState', Skeleton: 'Skeleton' },
        '../context/AuthContext.jsx': { useAuth: () => ({ user: { id: 'user1', role: 'user' } }) },
        '../services/api.js': { community: { send: () => { calls++; return pending; } } },
        '../hooks/usePolling.js': { __esModule: true, default: () => ({ data: { messages: [], nextBefore: null }, setData() {}, reload() {} }) },
        '../hooks/useCommunityRead.js': { __esModule: true, default() {} },
        '../context/MessageNotificationsContext.jsx': { useMessageNotifications: () => ({ community: 0, support: 0 }), OPEN_COMMUNITY_EVENT: 'open-room' },
        '../components/MessageCenter.jsx': { UnreadBadge: 'UnreadBadge' },
        '../utils/community.js': { isCommunityUnread, mergeCommunity, mergeCommunityMessages },
        '../utils/messageDelivery.js': { messageAttempt },
    });
    let tree = h.render();
    nodes(tree, (node) => node.type === 'textarea')[0].props.onChange({ target: { value: 'Xin chào mọi người' } });
    tree = h.render();
    const form = nodes(tree, (node) => node.type === 'form')[0];
    const first = form.props.onSubmit({ preventDefault() {} });
    await form.props.onSubmit({ preventDefault() {} });
    assert.equal(calls, 1);
    reject(new Error('Không có kết nối'));
    await first;
    tree = h.render();
    assert.equal(nodes(tree, (node) => node.type === 'textarea')[0].props.value, 'Xin chào mọi người');
    assert.equal(nodes(tree, (node) => node.props.role === 'alert').length, 1);
    h.unmount();
});

test('the unread divider uses the saved boundary and excludes own or removed messages', () => {
    const boundary = { at: 2, id: 'b' };
    assert.equal(isCommunityUnread(message('a', 1), boundary, 'another'), false);
    assert.equal(isCommunityUnread(message('b', 2), boundary, 'another'), false);
    assert.equal(isCommunityUnread(message('c', 2), boundary, 'another'), true);
    assert.equal(isCommunityUnread(message('c', 2), boundary, 'user1'), false);
    assert.equal(isCommunityUnread({ ...message('c', 2), deleted: true }, boundary, 'another'), false);
});

test('chat display and unread boundaries follow committed positions, not wall-clock timestamps', () => {
    const a = { ...message('a', 2000), position: 10 };
    const b = { ...message('b', 1000), position: 12 };
    assert.deepEqual(mergeCommunityMessages([b], [a]).map((m) => m.id), ['a', 'b']);
    assert.equal(isCommunityUnread(b, { position: 10, at: 2000, id: 'a' }, 'another'), true);
});
