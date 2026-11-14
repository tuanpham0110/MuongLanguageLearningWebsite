export const SUPPORT_READ_EVENT = 'muonglab:support-read';

/** Merge snapshots and POST responses without losing new messages or read receipts. */
export function mergeMessages(previous = [], incoming = []) {
    const byId = new Map((previous ?? []).map((message) => [message.id, message]));
    for (const message of incoming) {
        const old = byId.get(message.id);
        byId.set(message.id, { ...old, ...message, read: !!(old?.read || message.read) });
    }
    return [...byId.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function mergeThread(previous, next) {
    return { ...next, messages: mergeMessages(previous?.messages, next.messages) };
}
