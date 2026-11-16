import { test } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/speech_test', JWT_SECRET: 'isolated-speech-regression-secret-over-32-characters' });
const { compare, syllableScore, validateRecording, normalise } = await import('../src/modules/speech/speech.routes.js');

test('AI-01 Vietnamese lookalikes and tone loss cannot count as matching Muong syllables', () => {
    const result = compare('mặt tlăng', 'mặt trăng');
    assert.equal(result.score, 50);
    assert.equal(result.words.find((w) => w.text === 'tlăng').status, 'miss');
    assert.equal(syllableScore('pổn', 'pon'), 0);
    assert.equal(syllableScore('đá', 'da'), 0);
    assert.equal(syllableScore('tlăng', 'trăng'), 0);
});

test('SPEECH-04 recording validation rejects empty files and disguised HTML/images', () => {
    assert.throws(() => validateRecording(), { status: 400, field: 'audio' });
    for (const buffer of [Buffer.from('<html>not audio</html>'), Buffer.from([0x89, 0x50, 0x4e, 0x47, ...new Array(20).fill(0)])]) {
        assert.throws(() => validateRecording({ size: buffer.length, buffer, mimetype: 'audio/webm' }), { code: 'speech-bad-audio' });
    }
    const buffer = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...new Array(20).fill(0)]);
    const file = validateRecording({ size: buffer.length, buffer, mimetype: 'audio/ogg' });
    assert.equal(file.mimetype, 'audio/webm');
    assert.equal(normalise({ similarity: 1 }, 'native').score, 100);
    assert.equal(normalise({ score: 0 }, 'native').score, 0);
    assert.throws(() => normalise({}, 'native'), { code: 'speech-bad-response' });
});

test('AI-01 exact transcript match preserves Unicode while disclosing acoustic limitations', () => {
    const result = compare('Mặt tlăng', 'mặt tlăng'.normalize('NFD'));
    assert.equal(result.score, 100);
    assert.match(result.comment, /không.*(xác nhận|đánh giá).*phát âm/i);
    assert.equal(compare('pổn', '').score, 0);
    assert.ok(compare('pổn', 'pổn pổn pổn').score < 100);
    assert.equal(compare('', 'anything').score, 0);
});
