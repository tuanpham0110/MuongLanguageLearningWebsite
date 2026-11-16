import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { hookHarness, nodes, textOf } from './helpers/hooks.js';

function soundHarness({ stored, deferred = false, unsupported = false, deniedStorage = false, failedResume = false } = {}) {
    const instances = [];
    const storage = new Map(stored === undefined ? [] : [['muonglab.feedbackSound', stored]]);
    class AudioContext {
        constructor() { this.state = 'suspended'; this.currentTime = 5; this.destination = {}; this.notes = []; instances.push(this); }
        resume() {
            if (failedResume) return Promise.reject(new Error('audio blocked'));
            if (deferred) return new Promise((resolve) => { this.release = () => { this.state = 'running'; resolve(); }; });
            this.state = 'running';
            return Promise.resolve();
        }
        createOscillator() {
            const note = { frequency: { setValueAtTime: (value) => { note.hz = value; } }, connect() {}, disconnect() {}, start() {}, stop() { note.stops = (note.stops || 0) + 1; } };
            this.notes.push(note);
            return note;
        }
        createGain() {
            return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
        }
    }
    const browser = Object.assign(new EventTarget(), {
        AudioContext: unsupported ? undefined : AudioContext,
        localStorage: {
            getItem(key) { if (deniedStorage) throw new Error('denied'); return storage.get(key) ?? null; },
            setItem(key, value) { if (deniedStorage) throw new Error('denied'); storage.set(key, value); },
        },
    });
    const module = { exports: {} };
    const source = readFileSync(new URL('../src/services/feedbackSound.js', import.meta.url), 'utf8');
    vm.runInNewContext(transformSync(source, { format: 'cjs' }).code, { module, exports: module.exports, window: browser });
    return { sound: module.exports, instances, storage, browser };
}

test('answer audio uses distinct rising/falling cues and stops previous notes', async () => {
    const { sound, instances } = soundHarness();
    await sound.playFeedbackSound(true);
    const context = instances[0];
    assert.equal(context.notes.length, 3);
    assert.ok(context.notes[0].hz < context.notes[1].hz && context.notes[1].hz < context.notes[2].hz);
    await sound.playFeedbackSound(false);
    assert.ok(context.notes.slice(0, 3).every((n) => n.stops === 2));
    assert.ok(context.notes[3].hz > context.notes[4].hz);
    sound.stopFeedbackSound();
});

test('muting is remembered, notifies mounted controls and prevents context creation', async () => {
    const { sound, instances, storage } = soundHarness();
    const changes = [];
    const unsubscribe = sound.subscribeFeedbackSound((value) => changes.push(value));
    sound.setFeedbackSoundEnabled(false);
    await sound.playFeedbackSound(true);
    assert.equal(instances.length, 0);
    assert.equal(storage.get('muonglab.feedbackSound'), 'false');
    assert.deepEqual(changes, [false]);
    unsubscribe();
    assert.equal(soundHarness({ stored: 'false' }).sound.feedbackSoundEnabled(), false);
});

test('a pending browser audio unlock cannot play after mute or navigation', async () => {
    for (const cancel of ['mute', 'stop']) {
        const { sound, instances } = soundHarness({ deferred: true });
        const playing = sound.playFeedbackSound(true);
        if (cancel === 'mute') sound.setFeedbackSoundEnabled(false);
        else sound.stopFeedbackSound();
        instances[0].release();
        await playing;
        assert.equal(instances[0].notes.length, 0, cancel);
    }
});

test('unsupported audio, denied storage and rejected unlocks remain harmless', async () => {
    for (const options of [{ unsupported: true }, { deniedStorage: true }, { failedResume: true }]) {
        const { sound } = soundHarness(options);
        await assert.doesNotReject(() => sound.playFeedbackSound(false));
        assert.doesNotThrow(() => sound.setFeedbackSoundEnabled(false));
        assert.equal(sound.feedbackSoundEnabled(), false);
    }
});

test('sound preference follows changes from another tab', () => {
    const { sound, browser } = soundHarness();
    const changes = [];
    const unsubscribe = sound.subscribeFeedbackSound((value) => changes.push(value));
    browser.dispatchEvent(Object.assign(new Event('storage'), { key: 'muonglab.feedbackSound', newValue: 'false' }));
    assert.equal(sound.feedbackSoundEnabled(), false);
    assert.deepEqual(changes, [false]);
    unsubscribe();
});

test('feedback hook ignores late grading after its exercise unmounts', () => {
    const plays = [];
    let stops = 0;
    const h = hookHarness('../../src/hooks/useFeedbackSound.js', {
        '../services/feedbackSound.js': { playFeedbackSound: (value) => plays.push(value), prepareFeedbackSound() {}, stopFeedbackSound: () => { stops++; } },
    });
    const cue = h.render({});
    cue.play(true);
    h.unmount();
    cue.play(false);
    assert.deepEqual(plays, [true]);
    assert.equal(stops, 1);
});

test('exercise unlocks on submission and plays only fresh successful grading results', async () => {
    const calls = [];
    let resolveAnswer;
    let fail = false;
    const h = hookHarness('../../src/components/learn/ExerciseStage.jsx', {
        '../Icon.jsx': { __esModule: true, default: 'Icon' },
        '../SourceCitation.jsx': { __esModule: true, default: 'SourceCitation' },
        '../ui.jsx': { Button: 'Button' },
        './ShadowExercise.jsx': { __esModule: true, default: 'ShadowExercise' },
        './FeedbackSoundToggle.jsx': { __esModule: true, default: 'FeedbackSoundToggle' },
        '../../hooks/useFeedbackSound.js': { __esModule: true, default: () => ({ prepare: () => calls.push('unlock'), play: (value) => calls.push(value) }) },
        './Exercises.jsx': { ListenExercise: 'ListenExercise', BuildExercise: 'BuildExercise', fromSubmission: (_item, value) => value, toSubmission: (_item, value) => value },
    });
    const props = {
        item: { id: 'q', part: 'listen', options: ['one', 'two'] },
        onAnswer: () => { calls.push('answer'); return fail ? Promise.reject(new Error('offline')) : new Promise((resolve) => { resolveAnswer = resolve; }); },
    };
    let tree = h.render(props);
    assert.deepEqual(calls, []);
    nodes(tree, (n) => n.type === 'ListenExercise')[0].props.setResponse('one');
    tree = h.render(props);
    const check = () => nodes(h.render(props), (n) => n.type === 'Button' && textOf(n) === 'Kiểm tra')[0].props.onClick();
    const pending = check();
    assert.deepEqual(calls, ['unlock', 'answer']);
    resolveAnswer({ correct: false, answer: 'two' });
    await pending;
    assert.deepEqual(calls, ['unlock', 'answer', false]);
    h.render(props);
    assert.equal(calls.length, 3, 're-rendering feedback stays silent');
    nodes(h.render(props), (n) => n.type === 'Button' && textOf(n) === 'Làm lại')[0].props.onClick();
    nodes(h.render(props), (n) => n.type === 'ListenExercise')[0].props.setResponse('two');
    fail = true;
    await check();
    assert.deepEqual(calls, ['unlock', 'answer', false, 'unlock', 'answer'], 'network errors do not sound like wrong answers');
    h.unmount();
});
