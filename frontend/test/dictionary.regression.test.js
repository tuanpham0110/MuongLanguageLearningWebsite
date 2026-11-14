import test from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const deferred = () => {
    let resolve;
    const promise = new Promise((yes) => { resolve = yes; });
    return { promise, resolve };
};
function dictionaryHarness(dictionary) {
    const timers = new Map();
    let id = 0;
    const h = hookHarness('../../src/pages/Dictionary.jsx', {
        'react-router-dom': { Link: 'Link', useSearchParams: () => [new URLSearchParams(), () => {}] },
        '../components/ui.jsx': { Button: 'Button', EmptyState: 'EmptyState', ErrorState: 'ErrorState', Skeleton: 'Skeleton' },
        '../components/Icon.jsx': { __esModule: true, default: 'Icon' },
        '../components/learn/AudioPlayer.jsx': { __esModule: true, default: 'AudioPlayer', VoiceNote: 'VoiceNote' },
        '../services/api.js': { content: { dictionary }, notebook: { list: async () => [] } },
        '../context/ToastContext.jsx': { useToast: () => () => {} },
    }, {
        AbortController,
        setTimeout(fn) { timers.set(++id, fn); return id; },
        clearTimeout(key) { timers.delete(key); },
    });
    return {
        ...h,
        async search() {
            for (const [key, fn] of [...timers]) { timers.delete(key); fn(); }
            await flush();
        },
    };
}
const item = (id) => ({ id, text: id, type: 'word', meaning: id });

test('dictionary retry fetches the same query again after a network error', async () => {
    let calls = 0;
    const h = dictionaryHarness(async () => {
        if (++calls === 1) throw new Error('offline');
        return { total: 1, items: [item('found')] };
    });
    h.render({});
    await h.search();
    let tree = h.render({});
    nodes(tree, (n) => n.type === 'ErrorState')[0].props.onRetry();
    h.render({});
    await h.search();
    tree = h.render({});
    assert.equal(calls, 2);
    assert.equal(nodes(tree, (n) => n.type === 'ErrorState').length, 0);
    assert.equal(nodes(tree, (n) => n.props.e?.id === 'found').length, 1);
    h.unmount();
});

test('a late load-more response cannot append old entries to a new dictionary query', async () => {
    const pending = deferred();
    let moreSignal, calls = 0;
    const h = dictionaryHarness(async (query, signal) => {
        calls++;
        if (query.offset) { moreSignal = signal; return pending.promise; }
        return query.q === 'new'
            ? { total: 1, items: [item('new')] }
            : { total: 2, items: [item('old')] };
    });
    h.render({});
    await h.search();
    let tree = h.render({});
    const more = nodes(tree, (n) => n.type === 'Button' && textOf(n) === 'Xem thêm')[0];
    const firstLoad = more.props.onClick();
    await more.props.onClick();
    assert.equal(calls, 2);
    nodes(tree, (n) => n.type === 'input')[0].props.onChange({ target: { value: 'new' } });
    h.render({});
    assert.equal(moreSignal.aborted, true);
    await h.search();
    pending.resolve({ total: 2, items: [item('stale')] });
    await firstLoad;
    tree = h.render({});
    const entries = nodes(tree, (n) => n.props.e);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].props.e.id, 'new');
    h.unmount();
});
