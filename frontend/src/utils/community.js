/** A late snapshot must never erase a sent message or restore a removed message. */
export function mergeCommunityMessages(previous = [], incoming = [], removedIds = []) {
    const messages = new Map((previous ?? []).map((m) => [m.id, m]));
    for (const message of incoming) {
        const old = messages.get(message.id);
        const deleted = !!(old?.deleted || message.deleted);
        messages.set(message.id, { ...old, ...message, deleted, body: deleted ? '' : message.body });
    }
    for (const id of removedIds) {
        const message = messages.get(id);
        if (message) messages.set(id, { ...message, deleted: true, body: '' });
    }
    return [...messages.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export function mergeCommunity(previous, incoming) {
    return {
        ...incoming,
        // A subsequent snapshot describes the newest page, not the oldest page already loaded.
        nextBefore: previous?.messages?.length ? previous.nextBefore : incoming.nextBefore,
        messages: mergeCommunityMessages(previous?.messages, incoming.messages, incoming.removedIds),
    };
}

export function isCommunityUnread(message, lastRead, viewerId) {
    return !message.deleted && message.author.id !== viewerId && (!lastRead || message.at > lastRead.at || (message.at === lastRead.at && message.id > lastRead.id));
}
