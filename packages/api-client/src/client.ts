// Base fetch wrapper: JWT from localStorage, auto-refresh on 401, redirect on auth failure

const AUTH_PATH = '/api/v1/auth';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('dm3-token');
}

export function setToken(token: string, refresh?: string): void {
  localStorage.setItem('dm3-token', token);
  if (refresh) localStorage.setItem('dm3-refresh', refresh);
}

export function clearToken(): void {
  localStorage.removeItem('dm3-token');
  localStorage.removeItem('dm3-refresh');
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
      if (retry.ok) {
        if (retry.status === 204) return undefined as T;
        return retry.json();
      }
    }

    clearToken();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
