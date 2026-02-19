// API client layer for DM3 backend services

const AUTH_URL = '/api/v1/auth';
const DEVICE_URL = '/api/v1/devices';
const ACCESS_URL = '/api/v1';
const IDENTITY_URL = '/api/v1';

// ─── Token management ───────────────────────────────────────

export function getToken(): string | null {
  return localStorage.getItem('dm3-token');
}

export function setToken(token: string, refresh?: string) {
  localStorage.setItem('dm3-token', token);
  if (refresh) localStorage.setItem('dm3-refresh', refresh);
}

export function clearToken() {
  localStorage.removeItem('dm3-token');
  localStorage.removeItem('dm3-refresh');
}

// ─── Fetch wrapper ──────────────────────────────────────────

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Auth API ───────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(`${AUTH_URL}/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// ─── Device API (device-gateway :8002) ──────────────────────

export interface DeviceDTO {
  id: string;
  tenant_id: string;
  device_id: string;
  name?: string;
  type: string;
  status: string;
  firmware_version?: string;
  site_id?: string;
  location?: string;
  last_seen?: string;
  created_at: string;
  updated_at: string;
}

export async function fetchDevices(): Promise<DeviceDTO[]> {
  return apiFetch<DeviceDTO[]>(DEVICE_URL);
}

// ─── Access API (access-svc :8003) ──────────────────────────

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface StatsDTO {
  doors_online: number;
  doors_offline: number;
  doors_alarm: number;
  doors_total: number;
  events_today: number;
  granted_today: number;
  denied_today: number;
  recent_events: EventDTO[];
}

export interface DoorDTO {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  location: string;
  status: string;
  state: string;
  mode: string;
  created_at: string;
  updated_at: string;
}

export interface EventDTO {
  id: string;
  tenant_id: string;
  time: string;
  person_id?: string;
  person_name?: string;
  credential_type?: string;
  direction?: string;
  decision: string;
  reason?: string;
  confidence?: number;
  door_id?: string;
  door_name?: string;
}

export interface RuleDTO {
  id: string;
  tenant_id: string;
  name: string;
  doors: string[];
  groups: string[];
  schedule: { days: number[]; start_time: string; end_time: string };
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export async function fetchStats(): Promise<StatsDTO> {
  return apiFetch<StatsDTO>(`${ACCESS_URL}/stats`);
}

export async function fetchDoors(page = 1, limit = 50): Promise<Paginated<DoorDTO>> {
  return apiFetch<Paginated<DoorDTO>>(`${ACCESS_URL}/doors?page=${page}&limit=${limit}`);
}

export async function fetchEvents(page = 1, limit = 50): Promise<Paginated<EventDTO>> {
  return apiFetch<Paginated<EventDTO>>(`${ACCESS_URL}/events?page=${page}&limit=${limit}`);
}

export async function fetchRules(page = 1, limit = 50): Promise<Paginated<RuleDTO>> {
  return apiFetch<Paginated<RuleDTO>>(`${ACCESS_URL}/rules?page=${page}&limit=${limit}`);
}

// ─── Identity API (identity-svc :8004) ──────────────────────

export interface PersonDTO {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department?: string;
  role?: string;
  status: string;
  group_ids?: string[];
  created_at: string;
  updated_at: string;
}

export async function fetchPersons(page = 1, limit = 50): Promise<Paginated<PersonDTO>> {
  return apiFetch<Paginated<PersonDTO>>(`${IDENTITY_URL}/persons?page=${page}&limit=${limit}`);
}

// ─── WebSocket ──────────────────────────────────────────────

export type WSEventHandler = (event: EventDTO) => void;

export function connectWebSocket(onEvent: WSEventHandler): WebSocket | null {
  const token = getToken();
  if (!token) return null;

  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${window.location.host}/ws/events?token=${token}`;

  const ws = new WebSocket(wsUrl);

  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      onEvent(data);
    } catch { /* ignore parse errors */ }
  };

  ws.onerror = () => {
    console.warn('[WS] connection error');
  };

  return ws;
}
