import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

const button = (tree) => nodes(tree, (n) => n.type === 'button' && n.props.onClick)[0];
function setup() {
    const calls = [];
    const h = hookHarness('../../src/components/learn/ShadowExercise.jsx', {
        '../Icon.jsx': { __esModule: true, default: 'Icon' },
        './AudioPlayer.jsx': { __esModule: true, default: 'AudioPlayer' },
        '../../hooks/useRecorder.js': { __esModule: true, default: () => ({}) },
        '../../hooks/useMeta.js': { __esModule: true, default: () => ({}) },
        '../../context/AuthContext.jsx': { useAuth: () => ({ user: {} }) },
        '../../services/speech/assessment.js': {
            assessor: { assess: (_blob, _item, signal) => new Promise((resolve, reject) => calls.push({ resolve, reject, signal })) },
            band: () => ({ key: 'good', tone: 'ok', label: 'Text match' }),
        },
    }, { AbortController });
    return { h, calls };
}

test('SPEECH-02 late assessment from a previous recording cannot replace the current result', async () => {
    const { h, calls } = setup();
    let props = { item: { id: 'one' }, blob: new Blob(['first']), available: true, engine: 'ai' };
    h.render(props, 'NativeCompare');
    const pending = button(h.render(props, 'NativeCompare')).props.onClick();
    props = { ...props, blob: new Blob(['second']) };
    h.render(props, 'NativeCompare');
    assert.equal(calls[0].signal.aborted, true);
    calls[0].resolve({ score: 100, transcript: 'STALE_RECORDING', engine: 'ai' });
    await pending;
    assert.doesNotMatch(textOf(h.render(props, 'NativeCompare')), /STALE_RECORDING/);
    h.unmount();
});

test('SPEECH-02 rapid assessment clicks only issue one upstream request', async () => {
    const { h, calls } = setup();
    const props = { item: { id: 'one' }, blob: new Blob(['first']), available: true, engine: 'ai' };
    h.render(props, 'NativeCompare');
    const click = button(h.render(props, 'NativeCompare')).props.onClick;
    const pending = [click(), click()];
    const count = calls.length;
    for (const call of calls) call.resolve({ score: 100, engine: 'ai' });
    await Promise.all(pending);
    assert.equal(count, 1);
    h.unmount();
});

test('SPEECH-03 a recorder encoding error releases the microphone and clears the recording state', async () => {
    let current;
    let released = 0;
    class Recorder {
        constructor() { current = this; this.state = 'inactive'; }
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.onstop?.(); }
    }
    const h = hookHarness('../../src/hooks/useRecorder.js', {}, {
        navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { released++; } }] }) } },
        window: { MediaRecorder: Recorder }, MediaRecorder: Recorder,
        setInterval: () => 0, clearInterval: () => {},
    });
    await h.render({}).start();
    assert.equal(h.render({}).status, 'recording');
    current.onerror?.({ error: new Error('encoder failure') });
    assert.equal(h.render({}).status, 'error');
    assert.ok(released > 0);
    assert.equal(h.render({}).blob, null);
    h.unmount();
});
