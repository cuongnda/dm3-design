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

let _refreshing: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  const refresh = localStorage.getItem('dm3-refresh');
  if (!refresh) return false;

  try {
    const res = await fetch(`${AUTH_URL}/refresh`, {
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

async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    // Try refresh once (deduplicated across concurrent requests)
    if (!_refreshing) _refreshing = tryRefreshToken().finally(() => { _refreshing = null; });
    const refreshed = await _refreshing;

    if (refreshed) {
      // Retry original request with new token
      const newToken = getToken();
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      const retry = await fetch(url, { ...opts, headers });
      if (retry.ok) return retry.json();
    }

    clearToken();
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Auth API ───────────────────────────────────────────────

export interface LoginCompany {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  role: string;
}

export interface LoginUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  company_id?: string;
}

export interface LoginResponse {
  step: 'select_company' | 'complete';
  temporary_token?: string;
  access_token?: string;
  refresh_token?: string;
  user?: LoginUser;
  companies?: LoginCompany[];
}

// Legacy compat
export interface LegacyLoginResponse {
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

export async function loginStep2(temporaryToken: string, companyId: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(`${AUTH_URL}/login-step2`, {
    method: 'POST',
    body: JSON.stringify({ temporary_token: temporaryToken, company_id: companyId }),
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

// ─── System Admin API (auth-svc :8005) ──────────────────────

const SYSTEM_URL = '/api/v1/system';

export interface CompanyDTO {
  id: string;
  name: string;
  code: string;
  plan: string;
  status: string;
  address?: string;
  phone?: string;
  email?: string;
  max_devices: number;
  max_users: number;
  user_count?: number;
  device_count?: number;
  door_count?: number;
  event_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCompanyRequest {
  name: string;
  code: string;
  email: string;
  plan: string;
  address?: string;
  phone?: string;
  max_devices?: number;
  max_users?: number;
}

export interface CreateCompanyResponse {
  company: CompanyDTO;
  credentials: {
    email: string;
    password: string;
  };
}

export async function fetchCompanies(): Promise<CompanyDTO[]> {
  const res = await apiFetch<{ data: CompanyDTO[] } | CompanyDTO[]>(`${SYSTEM_URL}/companies`);
  return Array.isArray(res) ? res : res.data;
}

export async function fetchCompany(id: string): Promise<CompanyDTO> {
  return apiFetch<CompanyDTO>(`${SYSTEM_URL}/companies/${id}`);
}

export async function createCompany(data: CreateCompanyRequest): Promise<CreateCompanyResponse> {
  return apiFetch<CreateCompanyResponse>(`${SYSTEM_URL}/companies`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCompany(id: string, data: Partial<CreateCompanyRequest>): Promise<CompanyDTO> {
  return apiFetch<CompanyDTO>(`${SYSTEM_URL}/companies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function suspendCompany(id: string): Promise<void> {
  await apiFetch<void>(`${SYSTEM_URL}/companies/${id}`, { method: 'DELETE' });
}

// ─── Device Provisioning API (device-gateway :8002) ─────────

export interface ProvisionRequest {
  device_id: string;
  name: string;
  type: string;
  company_id?: string;
  site_id?: string;
  location?: string;
}

export interface ProvisionResponse {
  device: {
    id: string;
    device_id: string;
    name: string;
    type: string;
    status: string;
    company_id: string;
  };
  provisioning: {
    qr_token: string;
    qr_data: string;
    expires_at: string;
    ttl_minutes: number;
  };
}

export interface PendingDevice {
  id: string;
  rid: string;
  device_type: string;
  firmware_version?: string;
  hardware_fingerprint?: {
    android_id?: string;
    mac_address?: string;
    model?: string;
    app_signature_hash?: string;
  };
  signature_verified?: boolean;
  status: string;
  created_at: string;
}

export interface ApproveRequest {
  company_id: string;
  name: string;
  location?: string;
}

export async function provisionDevice(data: ProvisionRequest): Promise<ProvisionResponse> {
  return apiFetch<ProvisionResponse>(`${DEVICE_URL}/provision`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function regenerateQR(deviceDbId: string): Promise<ProvisionResponse> {
  return apiFetch<ProvisionResponse>(`${DEVICE_URL}/provision/${deviceDbId}/qr`);
}

export async function fetchPendingDevices(): Promise<PendingDevice[]> {
  const res = await apiFetch<{ data: PendingDevice[] } | PendingDevice[]>(`${DEVICE_URL}/pending`);
  return Array.isArray(res) ? res : res.data;
}

export async function approvePendingDevice(id: string, data: ApproveRequest): Promise<void> {
  await apiFetch<void>(`${DEVICE_URL}/pending/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function rejectPendingDevice(id: string): Promise<void> {
  await apiFetch<void>(`${DEVICE_URL}/pending/${id}/reject`, {
    method: 'POST',
  });
}

// ─── JWT Helper ─────────────────────────────────────────────

export function decodeJWT(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
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
