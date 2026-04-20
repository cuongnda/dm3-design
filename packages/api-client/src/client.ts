// Base fetch wrapper: JWT from localStorage, auto-refresh on 401, redirect on auth failure

const AUTH_PATH = '/api/v1/auth';

type TokenListener = (token: string | null) => void;
const _tokenListeners = new Set<TokenListener>();

/** Subscribe to token changes (set / clear). Returns an unsubscribe fn. */
export function subscribeToken(listener: TokenListener): () => void {
  _tokenListeners.add(listener);
  return () => {
    _tokenListeners.delete(listener);
  };
}

function notifyTokenListeners(token: string | null) {
  _tokenListeners.forEach((fn) => {
    try {
      fn(token);
    } catch {
      /* listener errors must not break auth flow */
    }
  });
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dm3-token');
}

export function setToken(token: string, refresh?: string): void {
  localStorage.setItem('dm3-token', token);
  if (refresh) localStorage.setItem('dm3-refresh', refresh);
  scheduleProactiveRefresh(token);
  notifyTokenListeners(token);
}

export function clearToken(): void {
  localStorage.removeItem('dm3-token');
  localStorage.removeItem('dm3-refresh');
  cancelProactiveRefresh();
  notifyTokenListeners(null);
}

// ─── Proactive refresh ──────────────────────────────────────

const REFRESH_SAFETY_MARGIN_S = 60;

let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

function decodeExpSeconds(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
    const exp = (payload as { exp?: number }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

function cancelProactiveRefresh() {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
}

function scheduleProactiveRefresh(token: string) {
  if (typeof window === 'undefined') return;
  cancelProactiveRefresh();
  const exp = decodeExpSeconds(token);
  if (exp === null) return;
  const nowSec = Math.floor(Date.now() / 1000);
  const refreshInSec = exp - nowSec - REFRESH_SAFETY_MARGIN_S;
  if (refreshInSec <= 0) {
    _refreshTimer = setTimeout(() => {
      void proactiveRefresh();
    }, 0);
    return;
  }
  const delayMs = Math.min(refreshInSec * 1000, 24 * 60 * 60 * 1000);
  _refreshTimer = setTimeout(() => {
    void proactiveRefresh();
  }, delayMs);
}

async function proactiveRefresh() {
  if (!_refreshing)
    _refreshing = tryRefreshToken().finally(() => {
      _refreshing = null;
    });
  await _refreshing;
}

/** Bootstrap hook: call once at app start to arm timers + listeners. */
export function setupAuthLifecycle(): void {
  if (typeof window === 'undefined') return;
  const existing = getToken();
  if (existing) scheduleProactiveRefresh(existing);

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    const tok = getToken();
    if (!tok) return;
    const exp = decodeExpSeconds(tok);
    if (exp === null) return;
    const nowSec = Math.floor(Date.now() / 1000);
    if (exp - nowSec <= REFRESH_SAFETY_MARGIN_S) {
      void proactiveRefresh();
    } else {
      scheduleProactiveRefresh(tok);
    }
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  window.addEventListener('storage', (e) => {
    if (e.key !== 'dm3-token') return;
    const next = e.newValue;
    if (next) {
      scheduleProactiveRefresh(next);
      notifyTokenListeners(next);
    } else {
      cancelProactiveRefresh();
      notifyTokenListeners(null);
    }
  });
}

// authenticatedUrl appends the JWT as a `?token=` query param for endpoints
// that are fetched outside of apiFetch — typically <img src>/<video src> where
// the browser can't attach an Authorization header. Rules:
//   - blob:/data: URLs are returned untouched (they don't round-trip the server).
//   - Cross-origin URLs are returned untouched so the token isn't leaked to
//     third-parties.
//   - Only same-origin URLs receive the token.
export function authenticatedUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;

  const token = getToken();
  if (!token) return url;

  try {
    const resolved = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    if (typeof window !== 'undefined' && resolved.origin !== window.location.origin) {
      return resolved.toString();
    }
    resolved.searchParams.set('token', token);
    return resolved.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }
}

let _refreshing: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem('dm3-refresh') : null;
  if (!refresh) return false;
  try {
    const res = await fetch(`${AUTH_PATH}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) {
      setToken(data.access_token, data.refresh_token || refresh);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    // Deduplicate concurrent refresh attempts
    if (!_refreshing) _refreshing = tryRefreshToken().finally(() => { _refreshing = null; });
    const refreshed = await _refreshing;

    if (refreshed) {
      const newToken = getToken();
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(url, { ...opts, headers });
      if (retry.ok) return parseApiBody<T>(retry);

      // After a successful refresh, a non-ok retry means the server
      // rejected the *request* — not the token. Only keep the forced
      // logout path for another 401 (refresh produced a token the
      // server still rejects). For any other status, surface the error
      // so the caller can handle it; logging the user out here would
      // mask real bugs (e.g. a 400 from a bad payload).
      if (retry.status !== 401) {
        const text = await retry.text().catch(() => '');
        throw new Error(`API ${retry.status}: ${text}`);
      }
    }

    clearToken();
    // Soft redirect via SPA router: ProtectedRoute listens for this event,
    // calls logout(), and Navigate to /login — preserves client state and
    // avoids a hard page reload mid-interaction.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dm3:auth-expired'));
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  return parseApiBody<T>(res);
}

// parseApiBody treats 204 No Content and an empty 200 body as T=undefined.
// A 200 with body "" happens for some framework-default PUT/DELETE paths;
// without the empty-body guard, res.json() throws SyntaxError and the call
// fails even though the operation succeeded.
async function parseApiBody<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (text === '') return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`API ${res.status}: invalid JSON response`);
  }
}
