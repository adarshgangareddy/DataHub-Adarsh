// The only place that talks to the backend. The browser never talks to the ESP32, MQTT or Supabase.
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const API_BASE = BASE;

export class ApiError extends Error {
  constructor(message, { code = 'UNKNOWN', status = 0, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(path, { method = 'GET', body, allow401 = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'include', // send the httpOnly session cookie
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        // Required by the backend on every state-changing request (CSRF defence).
        ...(method !== 'GET' ? { 'X-Requested-With': 'gate-dashboard' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check your internet connection and try again.', {
      code: 'NETWORK_ERROR',
    });
  }

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !json?.success) {
    const err = json?.error ?? {};
    if (res.status === 401 && !allow401) onUnauthorized();
    throw new ApiError(err.message || 'Something went wrong. Please try again.', {
      code: err.code || 'UNKNOWN',
      status: res.status,
      details: err.details,
    });
  }
  return json.data;
}

const dev = (id) => `/devices/${encodeURIComponent(id)}`;

export const api = {
  login: (username, password) => request('/auth/login', { method: 'POST', body: { username, password }, allow401: true }),
  logout: () => request('/auth/logout', { method: 'POST', allow401: true }),
  me: () => request('/auth/me', { allow401: true }),

  listDevices: () => request('/devices'),
  getDevice: (id) => request(dev(id)),
  getSchedule: (id) => request(`${dev(id)}/schedule`),
  saveSchedule: (id, day) => request(`${dev(id)}/schedule`, { method: 'PUT', body: day }),
  getLogs: (id, limit = 30) => request(`${dev(id)}/logs?limit=${limit}`),

  openGate: (id) => request(`${dev(id)}/commands/open`, { method: 'POST' }),
  closeGate: (id) => request(`${dev(id)}/commands/close`, { method: 'POST' }),
  setMode: (id, mode) => request(`${dev(id)}/commands/mode`, { method: 'POST', body: { mode } }),

  // Development only (backend answers 404 unless MOCK_DEVICE=true)
  getMock: () => request('/dev/mock'),
  setMock: (patch) => request('/dev/mock', { method: 'POST', body: patch }),
};
