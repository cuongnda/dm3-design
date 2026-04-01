// API client layer for DM3 backend services

const AUTH_URL = '/api/v1/auth';
const DEVICE_URL = '/api/v1/devices';

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

export async function apiFetch<T>(url: string, opts: RequestInit = {}): Promise<T> {
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
  site_id?: string;
  zone_id?: string;
  name: string;
  description?: string;
  type: string;
  location: string;
  floor?: string;
  building?: string;
  status: string; // online, offline, alarm, warning
  state: string; // locked, unlocked, alarm
  mode?: string;
  controller_id?: string;
  device_id?: string;
  unlock_duration_ms: number;
  anti_passback?: boolean;
  emergency_unlock?: boolean;
  camera_id?: string;
  firmware_version?: string;
  ip_address?: string;
  last_event_at?: string;
  last_heartbeat_at?: string;
  config_version?: number;
  person_db_version?: number;
  rules_version?: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface EventDTO {
  id: string;
  tenant_id: string;
  time: string;
  door_id?: string;
  device_id?: string;
  person_id?: string;
  person_name?: string;
  credential_type?: string;
  direction?: string;
  decision: string;
  reason?: string;
  confidence?: number;
  photo_ref?: string;
  metadata?: Record<string, any>;
}

export interface AccessRuleDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  name: string;
  description?: string;
  door_ids: string[];
  person_group_ids: string[];
  schedule_id?: string;
  schedule?: any;
  anti_passback?: boolean;
  multi_factor?: boolean;
  max_failed_attempts?: number;
  lockout_duration_ms?: number;
  priority: number;
  enabled: boolean;
  valid_from?: string;
  valid_until?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDTO {
  id: string;
  tenant_id: string;
  name: string;
  timezone: string;
  periods: any;
  holidays_excluded?: boolean;
  holiday_calendar_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDoorRequest {
  name: string;
  site_id?: string;
  zone_id?: string;
  description?: string;
  type: string;
  location: string;
  floor?: string;
  building?: string;
  device_id?: string;
  unlock_duration_ms?: number;
  anti_passback?: boolean;
  emergency_unlock?: boolean;
  camera_id?: string;
}

export interface CreateRuleRequest {
  name: string;
  site_id?: string;
  description?: string;
  door_ids: string[];
  person_group_ids: string[];
  schedule_id?: string;
  schedule_inline?: any;
  anti_passback?: boolean;
  multi_factor?: boolean;
  max_failed_attempts?: number;
  lockout_duration_ms?: number;
  priority?: number;
  enabled?: boolean;
  valid_from?: string;
  valid_until?: string;
}

export interface CreateScheduleRequest {
  name: string;
  timezone?: string;
  periods: any;
  holidays_excluded?: boolean;
  holiday_calendar_id?: string;
}

export async function fetchStats(): Promise<StatsDTO> {
  return apiFetch<StatsDTO>(`/api/v1/stats`);
}

export async function fetchDoors(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<DoorDTO>> {
  const qs = params ? '&' + new URLSearchParams(params).toString() : '';
  return apiFetch<Paginated<DoorDTO>>(`/api/v1/doors?page=${page}&limit=${limit}${qs}`);
}

export async function fetchDoor(id: string): Promise<DoorDTO> {
  return apiFetch<DoorDTO>(`/api/v1/doors/${id}`);
}

export async function createDoor(data: CreateDoorRequest): Promise<DoorDTO> {
  return apiFetch<DoorDTO>(`/api/v1/doors`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateDoor(id: string, data: Partial<CreateDoorRequest>): Promise<DoorDTO> {
  return apiFetch<DoorDTO>(`/api/v1/doors/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDoor(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/doors/${id}`, { method: 'DELETE' });
}

export async function fetchEvents(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<EventDTO>> {
  const qs = params ? '&' + new URLSearchParams(params).toString() : '';
  return apiFetch<Paginated<EventDTO>>(`/api/v1/events?page=${page}&limit=${limit}${qs}`);
}

export async function fetchRules(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<AccessRuleDTO>> {
  const qs = params ? '&' + new URLSearchParams(params).toString() : '';
  return apiFetch<Paginated<AccessRuleDTO>>(`/api/v1/rules?page=${page}&limit=${limit}${qs}`);
}

export async function fetchRule(id: string): Promise<AccessRuleDTO> {
  return apiFetch<AccessRuleDTO>(`/api/v1/rules/${id}`);
}

export async function createRule(data: CreateRuleRequest): Promise<AccessRuleDTO> {
  return apiFetch<AccessRuleDTO>(`/api/v1/rules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateRule(id: string, data: Partial<CreateRuleRequest>): Promise<AccessRuleDTO> {
  return apiFetch<AccessRuleDTO>(`/api/v1/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteRule(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/rules/${id}`, { method: 'DELETE' });
}

export async function fetchSchedules(page = 1, limit = 50): Promise<Paginated<ScheduleDTO>> {
  return apiFetch<Paginated<ScheduleDTO>>(`/api/v1/schedules?page=${page}&limit=${limit}`);
}

export async function createSchedule(data: CreateScheduleRequest): Promise<ScheduleDTO> {
  return apiFetch<ScheduleDTO>(`/api/v1/schedules`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
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
  employee_id?: string;
  status: string;
  photo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialDTO {
  id: string;
  tenant_id: string;
  person_id: string;
  type: string; // face, card, pin, qr, fingerprint
  value: string;
  status: string;
  valid_from?: string;
  valid_until?: string;
  created_at: string;
  updated_at: string;
}

export interface PersonGroupDTO {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  member_count?: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePersonRequest {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department?: string;
  role?: string;
  employee_id?: string;
  status?: string;
}

export interface CreateCredentialRequest {
  type: string;
  value: string;
  status?: string;
  valid_from?: string;
  valid_until?: string;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
}

export async function fetchPersons(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<PersonDTO>> {
  const qs = params ? '&' + new URLSearchParams(params).toString() : '';
  return apiFetch<Paginated<PersonDTO>>(`/api/v1/persons?page=${page}&limit=${limit}${qs}`);
}

export async function fetchPerson(id: string): Promise<PersonDTO> {
  return apiFetch<PersonDTO>(`/api/v1/persons/${id}`);
}

export async function createPerson(data: CreatePersonRequest): Promise<PersonDTO> {
  return apiFetch<PersonDTO>(`/api/v1/persons`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updatePerson(id: string, data: Partial<CreatePersonRequest>): Promise<PersonDTO> {
  return apiFetch<PersonDTO>(`/api/v1/persons/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deletePerson(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/persons/${id}`, { method: 'DELETE' });
}

export async function fetchCredentials(personId: string): Promise<CredentialDTO[]> {
  return apiFetch<CredentialDTO[]>(`/api/v1/persons/${personId}/credentials`);
}

export async function createCredential(personId: string, data: CreateCredentialRequest): Promise<CredentialDTO> {
  return apiFetch<CredentialDTO>(`/api/v1/persons/${personId}/credentials`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteCredential(personId: string, credId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/persons/${personId}/credentials/${credId}`, { method: 'DELETE' });
}

export async function uploadPhoto(personId: string, file: File): Promise<{ photo_url: string }> {
  const formData = new FormData();
  formData.append('photo', file);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`/api/v1/persons/${personId}/photo`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
}

export async function fetchGroups(page = 1, limit = 50): Promise<Paginated<PersonGroupDTO>> {
  return apiFetch<Paginated<PersonGroupDTO>>(`/api/v1/groups?page=${page}&limit=${limit}`);
}

export async function createGroup(data: CreateGroupRequest): Promise<PersonGroupDTO> {
  return apiFetch<PersonGroupDTO>(`/api/v1/groups`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGroup(id: string, data: Partial<CreateGroupRequest>): Promise<PersonGroupDTO> {
  return apiFetch<PersonGroupDTO>(`/api/v1/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGroup(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/groups/${id}`, { method: 'DELETE' });
}

export async function fetchGroupMembers(groupId: string): Promise<PersonDTO[]> {
  return apiFetch<PersonDTO[]>(`/api/v1/groups/${groupId}/members`);
}

export async function addGroupMember(groupId: string, personId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ person_id: personId }),
  });
}

export async function removeGroupMember(groupId: string, personId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/groups/${groupId}/members/${personId}`, { method: 'DELETE' });
}

export async function sendDeviceCommand(deviceId: string, command: string, params?: Record<string, any>): Promise<void> {
  await apiFetch<void>(`/api/v1/devices/${deviceId}/command`, {
    method: 'POST',
    // Backend expects { type, data } — map from legacy { command, params }
    body: JSON.stringify({ type: command, data: params || {} }),
  });
}

export async function fetchDeviceEvents(deviceId: string, page = 1, limit = 20): Promise<Paginated<EventDTO>> {
  return apiFetch<Paginated<EventDTO>>(`${DEVICE_URL}/${deviceId}/events?page=${page}&limit=${limit}`);
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

// ─── System Stats ───────────────────────────────────────────

export interface SystemStatsDTO {
  companies: { total: number; active: number; suspended: number };
  users: { total: number; active: number; inactive: number };
  devices: { total: number; online: number; offline: number };
  recent: { new_companies_7d: number; new_users_7d: number; new_devices_7d: number };
}

export async function fetchSystemStats(): Promise<SystemStatsDTO> {
  return apiFetch<SystemStatsDTO>(`${SYSTEM_URL}/stats`);
}

// ─── Companies ──────────────────────────────────────────────

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

// ─── Accounts ───────────────────────────────────────────────

export interface AccountDTO {
  id: string;
  company_id: string;
  company_name: string;
  company_code: string;
  owner_user_id?: string;
  owner_email?: string;
  owner_name?: string;
  plan: string;
  status: string;
  max_devices: number;
  max_users: number;
  max_doors: number;
  subscription_start?: string;
  subscription_end?: string;
  billing_email?: string;
  billing_info: Record<string, unknown>;
  settings: Record<string, unknown>;
  notes?: string;
  user_count: number;
  device_count: number;
  door_count: number;
  created_at: string;
  updated_at: string;
}

export interface AuditEntryDTO {
  id: string;
  actor_id?: string;
  actor_email?: string;
  action: string;
  changes: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface CreateAccountRequest {
  company_id: string;
  admin_email: string;
  plan?: string;
  max_devices?: number;
  max_users?: number;
  max_doors?: number;
  billing_email?: string;
}

export interface CreateAccountResponse {
  account: AccountDTO;
  admin: { email: string; password: string; role: string };
}

export interface UpdateAccountRequest {
  plan?: string;
  status?: string;
  max_devices?: number;
  max_users?: number;
  max_doors?: number;
  billing_email?: string;
  billing_info?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  notes?: string;
}

export async function fetchAccounts(
  page = 1,
  limit = 20,
  params?: Record<string, string>,
): Promise<Paginated<AccountDTO>> {
  const qs = params ? '&' + new URLSearchParams(params).toString() : '';
  return apiFetch<Paginated<AccountDTO>>(`${SYSTEM_URL}/accounts?page=${page}&limit=${limit}${qs}`);
}

export async function fetchAccount(id: string): Promise<AccountDTO> {
  return apiFetch<AccountDTO>(`${SYSTEM_URL}/accounts/${id}`);
}

export async function createAccount(data: CreateAccountRequest): Promise<CreateAccountResponse> {
  return apiFetch<CreateAccountResponse>(`${SYSTEM_URL}/accounts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAccount(id: string, data: UpdateAccountRequest): Promise<AccountDTO> {
  return apiFetch<AccountDTO>(`${SYSTEM_URL}/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function suspendAccount(id: string): Promise<void> {
  await apiFetch<void>(`${SYSTEM_URL}/accounts/${id}/suspend`, { method: 'POST' });
}

export async function reactivateAccount(id: string): Promise<void> {
  await apiFetch<void>(`${SYSTEM_URL}/accounts/${id}/reactivate`, { method: 'POST' });
}

export async function fetchAccountAudit(
  id: string,
  page = 1,
  limit = 20,
): Promise<Paginated<AuditEntryDTO>> {
  return apiFetch<Paginated<AuditEntryDTO>>(`${SYSTEM_URL}/accounts/${id}/audit?page=${page}&limit=${limit}`);
}

// ─── System Admin Device APIs ────────────────────────────────

export async function fetchSystemDevices(params?: Record<string, string>): Promise<any[]> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<any[]>(`${SYSTEM_URL}/devices${qs}`);
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

export interface RegenerateQRResponse {
  qr_token: string;
  qr_data: string;
  expires_at: string;
  ttl_minutes: number;
}

export async function regenerateQR(deviceDbId: string): Promise<RegenerateQRResponse> {
  return apiFetch<RegenerateQRResponse>(`${DEVICE_URL}/provision/${deviceDbId}/qr`);
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

export async function fetchDevice(id: string): Promise<DeviceDTO> {
  return apiFetch<DeviceDTO>(`${DEVICE_URL}/${id}`);
}

export async function updateDevice(id: string, data: Partial<{ name: string; location: string }>): Promise<DeviceDTO> {
  return apiFetch<DeviceDTO>(`${DEVICE_URL}/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteDevice(id: string): Promise<void> {
  await apiFetch<void>(`${DEVICE_URL}/${id}`, { method: 'DELETE' });
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
