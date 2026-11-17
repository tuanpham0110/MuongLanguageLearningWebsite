import test from 'node:test';
import assert from 'node:assert/strict';
import { messageAttempt } from '../src/utils/messageDelivery.js';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

test('send retries reuse their key; new text and a new successful send use different keys', async () => {
    const attempts = [];
    let fail = true;
    const h = hookHarness('../../src/components/Conversation.jsx', {
        './Icon.jsx': { __esModule: true, default: 'Icon' },
        '../hooks/useVisibleMessageReads.js': { __esModule: true, default() {} },
        '../utils/messageDelivery.js': { messageAttempt },
    });
    const props = { messages: [], mine: () => true, suggestions: ['Xin chào'], onSend: async (body, key) => {
        attempts.push({ body, key });
        if (fail) { fail = false; throw new Error('Lost response after save'); }
    } };
    const send = async () => {
        const tree = h.render(props);
        await nodes(tree, (node) => node.type === 'button' && textOf(node) === 'Xin chào')[0].props.onClick({ preventDefault() {} });
    };
    await send();
    await send();
    await send();
    assert.equal(attempts[0].key, attempts[1].key);
    assert.notEqual(attempts[1].key, attempts[2].key);
    assert.notEqual(messageAttempt(attempts[0], 'Đổi nội dung').clientMessageId, attempts[0].key);
    h.unmount();
});

test('support receipts require focus and visible incoming message ends, and retry failed acknowledgements', async () => {
    const document = new EventTarget(), window = new EventTarget();
    let focused = false;
    document.visibilityState = 'visible';
    document.hasFocus = () => focused;
    window.innerHeight = 800;
    const ends = { a: 300, b: 900, c: 350, d: 400 };
    const listRef = { current: { getBoundingClientRect: () => ({ top: 100, bottom: 600 }), querySelector: (selector) => {
        const id = selector.match(/"(.*?)"/)[1];
        return { getBoundingClientRect: () => ({ bottom: ends[id] }) };
    } } };
    const frames = new Map();
    let id = 0;
    const requests = [];
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    const animate = async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); await flush(); };
    const h = hookHarness('../../src/hooks/useVisibleMessageReads.js', {}, {
        document, window, AbortController,
        requestAnimationFrame(fn) { frames.set(++id, fn); return id; }, cancelAnimationFrame(id) { frames.delete(id); },
    });
    const props = {
        messages: [{ id: 'a' }, { id: 'b' }, { id: 'c', fromAdmin: true }, { id: 'd', read: true }],
        mine: (message) => !!message.fromAdmin, listRef,
        onRead(ids, signal) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ ids: [...ids], signal, resolve, reject }); return promise; },
    };
    h.render(props);
    await animate();
    assert.equal(requests.length, 0);
    focused = true;
    document.visibilityState = 'hidden';
    window.dispatchEvent(new Event('focus'));
    await animate();
    assert.equal(requests.length, 0);
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await animate();
    assert.deepEqual(requests[0].ids, ['a']);
    requests[0].reject(new Error('offline'));
    await flush();
    window.dispatchEvent(new Event('focus'));
    await animate();
    assert.deepEqual(requests[1].ids, ['a']);
    requests[1].resolve();
    await flush();
    ends.b = 500;
    window.dispatchEvent(new Event('scroll'));
    await animate();
    assert.deepEqual(requests[2].ids, ['b']);
    h.unmount();
    assert.equal(requests[2].signal.aborted, true);
    requests[2].resolve();
    await flush();
    assert.equal(requests.length, 3);
});

test('reply receipts retry offscreen messages in bounded batches without consuming newer arrivals', async () => {
    const document = new EventTarget(), window = new EventTarget();
    document.visibilityState = 'visible';
    document.hasFocus = () => true;
    window.innerHeight = 800;
    const frames = new Map(), requests = [];
    let frameId = 0;
    const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
    const animate = async () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); await flush(); };
    const h = hookHarness('../../src/hooks/useVisibleMessageReads.js', {}, {
        document, window, AbortController,
        requestAnimationFrame(fn) { frames.set(++frameId, fn); return frameId; }, cancelAnimationFrame(id) { frames.delete(id); },
    });
    const incoming = Array.from({ length: 401 }, (_, i) => ({ id: `incoming${i}` }));
    const props = {
        messages: [...incoming, { id: 'own', own: true }], mine: (m) => !!m.own,
        listRef: { current: { getBoundingClientRect: () => ({ top: 100, bottom: 600 }), querySelector: () => ({ getBoundingClientRect: () => ({ bottom: 900 }) }) } },
        onRead(ids, signal) { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); requests.push({ ids: [...ids], signal, resolve, reject }); return promise; },
    };
    const acknowledge = h.render(props);
    await animate();
    assert.equal(requests.length, 0, 'unseen history is not read just by loading it');
    acknowledge([...incoming.map((m) => m.id), 'own']);
    await animate();
    assert.equal(requests[0].ids.length, 200);
    props.messages = [...props.messages, { id: 'new-arrival' }];
    h.render(props);
    requests[0].reject(new Error('offline'));
    await flush();
    await animate();
    assert.equal(requests.length, 2, 'a later refresh retries the failed receipt');
    assert.deepEqual(requests[1].ids, requests[0].ids);
    for (let i = 1; i <= 3; i++) { requests[i].resolve(); await flush(); await animate(); }
    assert.deepEqual(requests.slice(1).map((r) => r.ids.length), [200, 200, 1]);
    assert.equal(new Set(requests.slice(1).flatMap((r) => r.ids)).size, 401);
    assert.ok(requests.every((r) => !r.ids.includes('own') && !r.ids.includes('new-arrival')));
    h.unmount();
    acknowledge(['new-arrival']);
    await animate();
    assert.equal(requests.length, 4, 'unmounted conversations cannot send receipts');
});
