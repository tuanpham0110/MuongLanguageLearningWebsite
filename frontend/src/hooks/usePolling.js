import { useCallback, useEffect, useRef, useState } from 'react';

const replace = (_previous, next) => next;

/** One request at a time; refresh on focus/reconnect and keep data during outages.
 * Mount with a different key when the resource identity changes.
 */
export default function usePolling(loader, { interval = 3000, merge = replace, restartOnReload = false } = {}) {
    const [state, setState] = useState({ data: null, error: null, loading: true });
    const loaderRef = useRef(loader);
    const mergeRef = useRef(merge);
    const reloadRef = useRef(() => {});
    loaderRef.current = loader;
    mergeRef.current = merge;

    useEffect(() => {
        let alive = true;
        let timer;
        let controller = null;
        let queued = false;
        const visible = () => document.visibilityState !== 'hidden';

        async function refresh() {
            if (!alive || !visible()) return;
            if (controller) {
                queued = true;
                return;
            }
            clearTimeout(timer);
            const current = new AbortController();
            controller = current;
            try {
                const next = await loaderRef.current(current.signal);
                if (alive && !current.signal.aborted) {
                    setState((s) => ({ data: mergeRef.current(s.data, next), error: null, loading: false }));
                }
            } catch (error) {
                if (alive && !current.signal.aborted) setState((s) => ({ ...s, error, loading: false }));
            } finally {
                if (controller === current) {
                    controller = null;
                    if (alive && visible()) {
                        timer = setTimeout(refresh, queued ? 0 : interval);
                        queued = false;
                    }
                }
            }
        }

        function suspend() {
            clearTimeout(timer);
            controller?.abort();
            controller = null;
            queued = false;
        }
        function onVisibility() {
            if (visible()) refresh();
            else suspend();
        }
        reloadRef.current = () => {
            // Counts and inbox snapshots must be fetched after a read acknowledgement.
            // Cursor-based message loaders keep the default queued refresh instead.
            if (restartOnReload) {
                controller?.abort();
                controller = null;
                queued = false;
            }
            refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', refresh);
        window.addEventListener('online', refresh);
        refresh();
        return () => {
            alive = false;
            suspend();
            reloadRef.current = () => {};
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', refresh);
            window.removeEventListener('online', refresh);
        };
    }, [interval, restartOnReload]);

    const reload = useCallback(() => reloadRef.current(), []);
    const setData = useCallback((update) => setState((s) => ({ ...s, data: typeof update === 'function' ? update(s.data) : update })), []);
    return { ...state, reload, setData };
}
