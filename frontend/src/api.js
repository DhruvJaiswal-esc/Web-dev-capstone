// Backend URL is configured at build time (see .env.example). The backend must list this site's origin in CLIENT_ORIGIN (CORS).
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
let tokens = JSON.parse(localStorage.getItem('tokens') || 'null');

export function setTokens(t) {
  tokens = t;
  if (t) localStorage.setItem('tokens', JSON.stringify(t));
  else localStorage.removeItem('tokens');
}

async function raw(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;
  return fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

// Calls the backend; refreshes the access token once on 401; throws Error(message) on failure.
export async function api(path, opts = {}) {
  let res = await raw(path, opts);
  if (res.status === 401 && opts.auth !== false && tokens?.refreshToken) {
    const r = await raw('/auth/refresh', { method: 'POST', body: { refreshToken: tokens.refreshToken }, auth: false });
    if (r.ok) {
      const j = await r.json();
      setTokens({ ...tokens, ...j.data });
      res = await raw(path, opts);
    } else {
      setTokens(null);
      localStorage.removeItem('user');
      location.reload();
    }
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json.details?.map((d) => `${d.path}: ${d.message}`).join(', ');
    throw new Error(detail || json.message || `Request failed (${res.status})`);
  }
  return json;
}

export const fmt = (d) => new Date(d).toLocaleString();
