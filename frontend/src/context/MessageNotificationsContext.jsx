import { createContext, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext.jsx';
import { messages } from '../services/api.js';
import usePolling from '../hooks/usePolling.js';
import { SUPPORT_READ_EVENT } from '../utils/support.js';

export const MESSAGES_CHANGED_EVENT = 'muonglab:messages-changed';
export const OPEN_COMMUNITY_EVENT = 'muonglab:community-latest';
const empty = { community: 0, support: 0, admin: 0, total: 0, loaded: false, refresh() {} };
const Context = createContext(empty);

function SignedInNotifications({ children }) {
    const { data, reload, error } = usePolling((signal) => messages.unread(signal), { interval: 5000 });
    useEffect(() => {
        window.addEventListener(SUPPORT_READ_EVENT, reload);
        window.addEventListener(MESSAGES_CHANGED_EVENT, reload);
        return () => {
            window.removeEventListener(SUPPORT_READ_EVENT, reload);
            window.removeEventListener(MESSAGES_CHANGED_EVENT, reload);
        };
    }, [reload]);
    return <Context.Provider value={{ ...empty, ...data, loaded: !!data, error, refresh: reload }}>{children}</Context.Provider>;
}

export function MessageNotificationsProvider({ children }) {
    const { user } = useAuth();
    return user
        ? <SignedInNotifications key={`${user.id}:${user.role}`} >{children}</SignedInNotifications>
        : <Context.Provider value={empty}>{children}</Context.Provider>;
}

export const useMessageNotifications = () => useContext(Context);

export function notifyMessagesChanged() {
    window.dispatchEvent(new Event(MESSAGES_CHANGED_EVENT));
}
