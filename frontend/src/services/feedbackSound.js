// Short, quiet feedback cues generated locally; no audio downloads are needed.
const STORAGE_KEY = 'muonglab.feedbackSound';
let enabled;
let context;
let resuming;
let revision = 0;
const listeners = new Set();
const voices = new Set();

export function feedbackSoundEnabled() {
    if (enabled === undefined) {
        try { enabled = window.localStorage.getItem(STORAGE_KEY) !== 'false'; }
        catch { enabled = true; }
    }
    return enabled;
}

export function stopFeedbackSound() {
    revision++;
    for (const { oscillator, gain } of voices) {
        try { oscillator.stop(); } catch { /* Already ended. */ }
        try { oscillator.disconnect(); } catch { /* Device may have gone away. */ }
        try { gain.disconnect(); } catch { /* Device may have gone away. */ }
    }
    voices.clear();
}

export function setFeedbackSoundEnabled(value) {
    enabled = !!value;
    if (!enabled) stopFeedbackSound();
    try { window.localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* Keep the choice for this visit. */ }
    for (const listener of listeners) listener(enabled);
}

function onStorage(event) {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    enabled = event.newValue !== 'false';
    if (!enabled) stopFeedbackSound();
    for (const listener of listeners) listener(enabled);
}

export function subscribeFeedbackSound(listener) {
    if (!listeners.size) window.addEventListener('storage', onStorage);
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (!listeners.size) window.removeEventListener('storage', onStorage);
    };
}

// Call synchronously in the click/keyboard handler, before awaiting API grading.
export function prepareFeedbackSound() {
    if (!feedbackSoundEnabled()) return Promise.resolve(false);
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return Promise.resolve(false);
        if (!context || context.state === 'closed') context = new AudioContext();
        if (context.state === 'running') return Promise.resolve(true);
        if (!resuming) {
            resuming = Promise.resolve(context.resume())
                .then(() => context.state === 'running', () => false)
                .finally(() => { resuming = undefined; });
        }
        return resuming;
    } catch {
        return Promise.resolve(false);
    }
}

export async function playFeedbackSound(correct) {
    if (typeof correct !== 'boolean' || !feedbackSoundEnabled()) return;
    stopFeedbackSound();
    const request = revision;
    if (!await prepareFeedbackSound() || request !== revision || !feedbackSoundEnabled()) return;
    try {
        // Rising major notes celebrate success; a soft falling pair invites a retry.
        const notes = correct ? [523.25, 659.25, 783.99] : [293.66, 246.94];
        const now = context.currentTime;
        for (const [i, frequency] of notes.entries()) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const voice = { oscillator, gain };
            voices.add(voice);
            const start = now + i * 0.105;
            const end = start + 0.17;
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.linearRampToValueAtTime(correct ? 0.075 : 0.06, start + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, end);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.onended = () => {
                oscillator.disconnect();
                gain.disconnect();
                voices.delete(voice);
            };
            oscillator.start(start);
            oscillator.stop(end);
        }
    } catch {
        // Audio is optional: browser/device failures must never interrupt an answer.
        stopFeedbackSound();
    }
}
