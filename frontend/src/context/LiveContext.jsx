import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE } from '../services/api.js';
import { useAuth } from './AuthContext.jsx';

// One Server-Sent Events connection for the whole app. The backend pushes device, command,
// schedule and log changes; pages subscribe with subscribe(). If the stream drops, `connected`
// turns false and pages fall back to slow polling.
const LiveContext = createContext({ connected: false, subscribe: () => () => {} });
export const useLive = () => useContext(LiveContext);

const EVENT_TYPES = ['device', 'command', 'schedule', 'log'];

export function LiveProvider({ children }) {
  const { user, checkSession } = useAuth();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set());

  useEffect(() => {
    if (!user) return undefined;
    const source = new EventSource(`${API_BASE}/api/events`, { withCredentials: true });

    source.onopen = () => setConnected(true);
    source.onerror = () => {
      setConnected(false);
      // CLOSED (not just reconnecting) usually means the session ended: re-check it.
      if (source.readyState === EventSource.CLOSED) checkSession();
    };
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        listeners.current.forEach((fn) => fn(type, data));
      });
    }
    return () => {
      source.close();
      setConnected(false);
    };
  }, [user, checkSession]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  const value = useMemo(() => ({ connected, subscribe }), [connected, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
