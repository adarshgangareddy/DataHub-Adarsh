import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from '../services/api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, mockDevice: false, sessionExpiresAt: null });

  const checkSession = useCallback(async () => {
    try {
      const data = await api.me();
      setState({ status: 'ready', user: data.user, mockDevice: data.mockDevice, sessionExpiresAt: data.sessionExpiresAt });
    } catch {
      setState({ status: 'ready', user: null, mockDevice: false, sessionExpiresAt: null });
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Any 401 from the API means the session is gone: return to the login page.
  useEffect(() => {
    setUnauthorizedHandler(() => setState((s) => (s.user ? { ...s, user: null } : s)));
    return () => setUnauthorizedHandler(() => {});
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.login(username, password);
    setState((s) => ({ ...s, status: 'ready', user: data.user, mockDevice: data.mockDevice }));
    checkSession(); // fills in the session expiry
  }, [checkSession]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setState({ status: 'ready', user: null, mockDevice: false, sessionExpiresAt: null });
    }
  }, []);

  const value = useMemo(() => ({ ...state, login, logout, checkSession }), [state, login, logout, checkSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
