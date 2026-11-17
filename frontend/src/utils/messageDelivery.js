/** Keep one key while retrying the same failed send. A successful send starts a new attempt. */
export function messageAttempt(previous, body) {
    return previous?.body === body ? previous : { body, clientMessageId: globalThis.crypto.randomUUID() };
}
