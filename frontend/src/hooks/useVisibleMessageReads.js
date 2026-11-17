import { useEffect, useRef } from 'react';

/** Read receipts are sent only for incoming message ends visible in the focused tab. */
export default function useVisibleMessageReads({ messages, mine, onRead, listRef }) {
    const current = useRef({ messages, mine, onRead });
    const scheduleRef = useRef(() => {});
    const acknowledged = useRef(new Set());
    current.current = { messages, mine, onRead };
    useEffect(() => {
        let alive = true, frame = 0, request = null, queued = false;
        function schedule() {
            if (!alive || frame) return;
            frame = requestAnimationFrame(() => { frame = 0; markVisible(); });
        }
        async function markVisible() {
            if (!alive || !current.current.onRead || document.visibilityState === 'hidden' || !document.hasFocus()) return;
            if (request) { queued = true; return; }
            const list = listRef.current;
            if (!list) return;
            const bounds = list.getBoundingClientRect();
            const top = Math.max(bounds.top, 0), bottom = Math.min(bounds.bottom, window.innerHeight);
            const ids = current.current.messages.filter((message) => {
                if (message.read || current.current.mine(message) || acknowledged.current.has(message.id)) return false;
                const element = list.querySelector(`[data-support-message-id="${message.id}"]`);
                if (!element) return false;
                const end = element.getBoundingClientRect().bottom;
                return end > top + 2 && end <= bottom + 2;
            }).slice(0, 200).map((message) => message.id);
            if (!ids.length) return;
            const controller = new AbortController();
            request = controller;
            try {
                await current.current.onRead(ids, controller.signal);
                if (alive && !controller.signal.aborted) ids.forEach((id) => acknowledged.current.add(id));
            } catch {
                // The next refresh/focus retries; failed receipts must retain the unread badge.
            } finally {
                request = null;
                if (queued && alive) { queued = false; schedule(); }
            }
        }
        scheduleRef.current = schedule;
        document.addEventListener('visibilitychange', schedule);
        window.addEventListener('focus', schedule);
        window.addEventListener('resize', schedule);
        window.addEventListener('scroll', schedule, true);
        schedule();
        return () => {
            alive = false;
            cancelAnimationFrame(frame);
            request?.abort();
            scheduleRef.current = () => {};
            document.removeEventListener('visibilitychange', schedule);
            window.removeEventListener('focus', schedule);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('scroll', schedule, true);
        };
    }, [listRef]);
    useEffect(() => scheduleRef.current(), [messages]);
}
