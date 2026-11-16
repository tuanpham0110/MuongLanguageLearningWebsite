const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

/** Identify supported media containers from bytes; upstream decoders still validate audio content. */
export function sniff(buf) {
    if (!buf || buf.length < 12) return null;
    if (buf[0] === 0x89 && ascii(buf, 1, 4) === 'PNG') return { mime: 'image/png', kind: 'image' };
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', kind: 'image' };
    if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image' };
    if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WAVE') return { mime: 'audio/wav', kind: 'audio' };
    if (ascii(buf, 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', kind: 'audio' };
    if (ascii(buf, 0, 4) === 'OggS') return { mime: 'audio/ogg', kind: 'audio' };
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return { mime: 'audio/webm', kind: 'audio' };
    if (ascii(buf, 4, 8) === 'ftyp') return { mime: 'audio/mp4', kind: 'audio' };
    return null;
}
