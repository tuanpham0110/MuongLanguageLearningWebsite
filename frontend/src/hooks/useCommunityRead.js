import { useEffect, useRef } from 'react';
import { community } from '../services/api.js';
import { notifyMessagesChanged } from '../context/MessageNotificationsContext.jsx';

/** Acknowledge only the last rendered message while the reader can see the bottom of the room. */
export default function useCommunityRead({ messages, listRef, nearBottom }) {
    const latestRef = useRef(null);
    const readRef = useRef(null);
    const scheduleRef = useRef(() => {});
    latestRef.current = messages?.at(-1)?.id ?? null;

    useEffect(() => {
        let alive = true;
        let frame = 0;
        let request = null;
        function schedule() {
            if (!alive || frame) return;
            frame = requestAnimationFrame(() => { frame = 0; mark(); });
        }
        async function mark() {
            const id = latestRef.current;
            const list = listRef.current;
            if (!alive || !id || id === readRef.current || request || !list || !nearBottom.current || document.visibilityState === 'hidden' || !document.hasFocus()) return;
            const last = list.querySelector(`[data-message-id="${id}"]`);
            if (!last) return;
            const bounds = list.getBoundingClientRect();
            const bottom = last.getBoundingClientRect().bottom;
            if (bottom > Math.min(bounds.bottom, window.innerHeight) + 2 || bottom < Math.max(bounds.top, 0)) return;
            const controller = new AbortController();
            request = controller;
            try {
                await community.markRead(id, controller.signal);
                if (alive && !controller.signal.aborted) { readRef.current = id; notifyMessagesChanged(); }
            } catch {
                // Keep the unread badge until a later refresh/focus can acknowledge successfully.
            } finally {
                request = null;
                if (alive && readRef.current === id && latestRef.current !== id) schedule();
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
    }, [listRef, nearBottom]);
    useEffect(() => scheduleRef.current(), [messages]);
}
