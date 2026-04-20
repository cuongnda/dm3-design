// API client layer for DM3 backend services

import i18n from '@/i18n';

const AUTH_URL = '/api/v1/auth';
const GATEWAY_URL = '/api/v1/gateway';
const ACCESS_URL = '/api/v1/access';
const IDENTITY_URL = '/api/v1/identity';

// ─── Token management ───────────────────────────────────────

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
    return localStorage.getItem('dm3-token');
}

export function setToken(token: string, refresh?: string) {
    localStorage.setItem('dm3-token', token);
    if (refresh) localStorage.setItem('dm3-refresh', refresh);
    scheduleProactiveRefresh(token);
    notifyTokenListeners(token);
}

export function clearToken() {
    localStorage.removeItem('dm3-token');
    localStorage.removeItem('dm3-refresh');
    cancelProactiveRefresh();
    notifyTokenListeners(null);
}

// ─── Proactive refresh ──────────────────────────────────────
// Background silent refresh avoids the "click menu → 401 → error" experience.
// Strategy:
//  1. On every setToken(), decode JWT `exp` and schedule a setTimeout at
//     (exp − 60s) that calls tryRefreshToken().
//  2. On visibilitychange → visible, if token is already expired or
//     near-expiry, refresh synchronously before any query fires.

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
    cancelProactiveRefresh();
    const exp = decodeExpSeconds(token);
    if (exp === null) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const refreshInSec = exp - nowSec - REFRESH_SAFETY_MARGIN_S;
    if (refreshInSec <= 0) {
        // Already near/past expiry — refresh on next tick.
        _refreshTimer = setTimeout(() => {
            void proactiveRefresh();
        }, 0);
        return;
    }
    // Cap to ~24h to avoid 32-bit overflow on weird tokens.
    const delayMs = Math.min(refreshInSec * 1000, 24 * 60 * 60 * 1000);
    _refreshTimer = setTimeout(() => {
        void proactiveRefresh();
    }, delayMs);
}

async function proactiveRefresh() {
    // Reuse single-flight dedup with reactive path.
    if (!_refreshing)
        _refreshing = tryRefreshToken().finally(() => {
            _refreshing = null;
        });
    await _refreshing;
}

/**
 * Register app-level listeners that keep the token fresh while the tab is
 * open. Call once at bootstrap.
 */
export function setupAuthLifecycle() {
    if (typeof window === 'undefined') return;
    // Reschedule timer on fresh bootstrap (page load / hard reload).
    const existing = getToken();
    if (existing) scheduleProactiveRefresh(existing);

    // When the tab becomes visible again after being idle, the setTimeout
    // may not have fired reliably (browsers throttle background timers).
    // Refresh eagerly if the token is close to expiry.
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
            // Still valid but previous timer may have been suspended — reschedule.
            scheduleProactiveRefresh(tok);
        }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    // Cross-tab: if another tab refreshed the token, pick it up here.
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

// ─── Fetch wrapper ──────────────────────────────────────────

let _refreshing: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
    const refresh = localStorage.getItem('dm3-refresh');
    if (!refresh) return false;

    const lang = i18n.language?.split('-')[0] ?? 'en';
    try {
        const res = await fetch(`${AUTH_URL}/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Let backend i18n translate error messages if needed.
                'Accept-Language': lang,
            },
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
    const tokenAtRequest = getToken();
    const lang = i18n.language?.split('-')[0] ?? 'en';
    // For FormData, let the browser set Content-Type (including multipart
    // boundary). For everything else, default to JSON.
    const isFormData = typeof FormData !== 'undefined' && opts.body instanceof FormData;
    const headers: Record<string, string> = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        'Accept-Language': lang,
        ...(opts.headers as Record<string, string>),
    };
    if (tokenAtRequest) headers['Authorization'] = `Bearer ${tokenAtRequest}`;

    const res = await fetch(url, { ...opts, headers });

    if (res.status === 401) {
        // If the token was replaced during this request (e.g. user logged in on another tab
        // or a login completed while this background fetch was in-flight), don't clear the
        // new token — just bail out silently.
        const tokenNow = getToken();
        if (tokenNow && tokenNow !== tokenAtRequest) {
            throw new Error('Unauthorized');
        }

        // Try refresh once (deduplicated across concurrent requests)
        if (!_refreshing)
            _refreshing = tryRefreshToken().finally(() => {
                _refreshing = null;
            });
        const refreshed = await _refreshing;

        if (refreshed) {
            // Retry original request with new token
            const newToken = getToken();
            if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
            const retry = await fetch(url, { ...opts, headers });
            if (retry.ok) return retry.json();
        }

        clearToken();
        // Dispatch a custom event so the auth layer can redirect via the
        // SPA router instead of a hard page reload. This avoids interrupting
        // in-flight navigations and losing client-side state.
        window.dispatchEvent(new CustomEvent('dm3:auth-expired'));
        throw new Error('Unauthorized');
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`API ${res.status}: ${text}`);
    }

    if (res.status === 204 || res.headers.get('content-length') === '0') {
        return undefined as unknown as T;
    }

    return res.json();
}

// ─── Asset URL helper ───────────────────────────────────────
// /photos/* is served by an auth-protected route; <img> tags can't send
// Authorization headers, so append the JWT as a ?token= query param.
export function assetUrl(path: string | null | undefined): string {
    if (!path) return '';
    if (!path.startsWith('/photos/')) return path;
    const token = getToken();
    if (!token) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}token=${encodeURIComponent(token)}`;
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
    tenant_id?: string;
    company_id?: string;
}

export interface LoginResponse {
    step: 'select_company' | 'complete';
    temporary_token?: string;
    access_token?: string;
    refresh_token?: string;
    user?: LoginUser;
    companies?: LoginCompany[];
    enabled_plugins?: string[];
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
        body: JSON.stringify({ temporary_token: temporaryToken, tenant_id: companyId }),
    });
}

// ─── Device API (device-gateway :8002) ──────────────────────

export interface DeviceDTO {
    id: string;
    company_id: string;
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
    return apiFetch<DeviceDTO[]>(`${GATEWAY_URL}/devices`);
}

// ─── Access API (access-svc :8003) ──────────────────────────

export interface Paginated<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

export interface HourlyBucket {
    hour: number;
    granted: number;
    denied: number;
}

export interface StatsDTO {
    doors_online: number;
    doors_offline: number;
    doors_alarm: number;
    doors_total: number;
    events_today: number;
    granted_today: number;
    denied_today: number;
    on_site_count: number;
    entries_last_hour: number;
    denies_last_hour: number;
    peak_hour_label: string;
    peak_hour_count: number;
    hourly: HourlyBucket[];
    recent_events: EventDTO[];
}

export interface AccessDeviceDTO {
    id: string;
    tenant_id: string;
    device_id?: string;
    name: string;
    type: string;
    status: string; // online, offline, alarm
    state: string; // locked, unlocked
    mode: string; // normal, lockdown, free
    unlock_duration_ms: number;
    anti_passback: boolean;
    emergency_unlock: boolean;
    firmware_version?: string;
    ip_address?: string;
    last_event_at?: string;
    last_heartbeat_at?: string;
    config_version: number;
    user_db_version: number;
    rules_version: number;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface EventDTO {
    id: string;
    company_id: string;
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
    metadata?: Record<string, unknown>;
}

export interface AccessRuleDTO {
    id: string;
    company_id: string;
    site_id?: string;
    name: string;
    description?: string;
    door_ids: string[];
    person_group_ids: string[];
    schedule_id?: string;
    schedule?: Record<string, unknown>;
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
    company_id: string;
    name: string;
    timezone: string;
    periods: Record<string, unknown>;
    holidays_excluded?: boolean;
    holiday_calendar_id?: string;
    created_at: string;
    updated_at: string;
}

export interface CreateAccessDeviceRequest {
    name: string;
    type: string;
    device_id?: string;
    unlock_duration_ms?: number;
    anti_passback?: boolean;
    emergency_unlock?: boolean;
}

export interface CreateRuleRequest {
    name: string;
    site_id?: string;
    description?: string;
    door_ids: string[];
    person_group_ids: string[];
    schedule_id?: string;
    schedule_inline?: Record<string, unknown>;
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
    periods: Record<string, unknown>;
    holidays_excluded?: boolean;
    holiday_calendar_id?: string;
}

export interface AccessPointDTO {
    id: string;
    tenant_id: string;
    zone_id?: string;
    access_time_id?: string;
    name: string;
    description?: string;
    access_device_count: number;
    device_status?: string;  // online | offline
    door_state?: string;     // closed | open | held_open | forced | alarm
    zone_name?: string;
    created_at: string;
    updated_at: string;
}

export async function sendDoorCommand(accessPointId: string, action: string, durationMs?: number): Promise<unknown> {
    return apiFetch(`${GATEWAY_URL}/access-points/${accessPointId}/door-command`, {
        method: 'POST',
        body: JSON.stringify({ action, duration_ms: durationMs }),
    });
}

export async function sendBulkDoorCommand(accessPointIds: string[], action: string, durationMs?: number): Promise<unknown> {
    return apiFetch(`${GATEWAY_URL}/access-points/door-command/bulk`, {
        method: 'POST',
        body: JSON.stringify({ access_point_ids: accessPointIds, action, duration_ms: durationMs, reason: 'emergency' }),
    });
}

// ─── Emergency API ──────────────────────────────────────────

export interface EmergencyPlanDTO {
    id: string;
    tenant_id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    action: string;      // unlock | lock | hold_open | hold_close
    target_type: string;  // all | zone | access_point | device
    target_ids: string[];
    countdown_seconds: number;
    enabled: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface EmergencyIncidentDTO {
    id: string;
    plan_id: string;
    plan_name: string;
    action: string;
    status: string; // active | all_clear | cancelled
    triggered_by_email: string;
    all_clear_by_email: string;
    activated_at: string;
    resolved_at?: string;
    duration_seconds?: number;
    target_summary: string;
    notes: string;
}

export interface ActivateEmergencyResponse {
    incident: EmergencyIncidentDTO;
    access_point_ids: string[];
    action: string;
}

export async function fetchEmergencyPlans(): Promise<EmergencyPlanDTO[]> {
    return apiFetch<EmergencyPlanDTO[]>(`${ACCESS_URL}/emergency/plans`);
}

export async function fetchEmergencyPlan(id: string): Promise<EmergencyPlanDTO> {
    return apiFetch<EmergencyPlanDTO>(`${ACCESS_URL}/emergency/plans/${id}`);
}

export async function createEmergencyPlan(data: Partial<EmergencyPlanDTO>): Promise<EmergencyPlanDTO> {
    return apiFetch<EmergencyPlanDTO>(`${ACCESS_URL}/emergency/plans`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateEmergencyPlan(id: string, data: Partial<EmergencyPlanDTO>): Promise<EmergencyPlanDTO> {
    return apiFetch<EmergencyPlanDTO>(`${ACCESS_URL}/emergency/plans/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteEmergencyPlan(id: string): Promise<void> {
    await apiFetch(`${ACCESS_URL}/emergency/plans/${id}`, { method: 'DELETE' });
}

export async function activateEmergency(planId: string, notes?: string): Promise<ActivateEmergencyResponse> {
    return apiFetch<ActivateEmergencyResponse>(`${ACCESS_URL}/emergency/activate`, {
        method: 'POST',
        body: JSON.stringify({ plan_id: planId, notes: notes || '' }),
    });
}

export interface AllClearResponse {
    incident: EmergencyIncidentDTO;
    access_point_ids: string[];
}

export async function allClearEmergency(incidentId: string, notes?: string): Promise<AllClearResponse> {
    return apiFetch<AllClearResponse>(`${ACCESS_URL}/emergency/incidents/${incidentId}/all-clear`, {
        method: 'POST',
        body: JSON.stringify({ notes: notes || '' }),
    });
}

export async function fetchEmergencyIncidents(page = 1, limit = 20): Promise<Paginated<EmergencyIncidentDTO>> {
    return apiFetch<Paginated<EmergencyIncidentDTO>>(`${ACCESS_URL}/emergency/incidents?page=${page}&limit=${limit}`);
}

export async function fetchActiveEmergencies(): Promise<EmergencyIncidentDTO[]> {
    return apiFetch<EmergencyIncidentDTO[]>(`${ACCESS_URL}/emergency/incidents/active`);
}

export interface AccessPointStats {
    online: number;
    offline: number;
    warning: number;
    alarm: number;
}

export interface AccessPointListResponse extends Paginated<AccessPointDTO> {
    stats?: AccessPointStats;
}

export interface ZoneDTO {
    id: string;
    name: string;
    tenant_id: string;
}

export async function fetchZones(): Promise<ZoneDTO[]> {
    const res = await apiFetch<Paginated<ZoneDTO>>(`${ACCESS_URL}/zones?limit=200`);
    return res.data || [];
}

export async function fetchAccessPoints(page = 1, limit = 50, params?: Record<string, string>): Promise<AccessPointListResponse> {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return apiFetch<AccessPointListResponse>(`${ACCESS_URL}/access-points?page=${page}&limit=${limit}${qs}`);
}

export async function fetchStats(): Promise<StatsDTO> {
    return apiFetch<StatsDTO>(`${ACCESS_URL}/stats`);
}

export async function fetchAccessDevices(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<AccessDeviceDTO>> {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return apiFetch<Paginated<AccessDeviceDTO>>(`${ACCESS_URL}/access-devices?page=${page}&limit=${limit}${qs}`);
}

export async function fetchAccessDevice(id: string): Promise<AccessDeviceDTO> {
    return apiFetch<AccessDeviceDTO>(`${ACCESS_URL}/access-devices/${id}`);
}

export async function createAccessDevice(data: CreateAccessDeviceRequest): Promise<AccessDeviceDTO> {
    return apiFetch<AccessDeviceDTO>(`${ACCESS_URL}/access-devices`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateAccessDevice(id: string, data: Partial<CreateAccessDeviceRequest>): Promise<AccessDeviceDTO> {
    return apiFetch<AccessDeviceDTO>(`${ACCESS_URL}/access-devices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteAccessDevice(id: string): Promise<void> {
    await apiFetch<void>(`${ACCESS_URL}/access-devices/${id}`, { method: 'DELETE' });
}

export async function fetchEvents(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<EventDTO>> {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return apiFetch<Paginated<EventDTO>>(`${ACCESS_URL}/events?page=${page}&limit=${limit}${qs}`);
}

export async function fetchRules(page = 1, limit = 50, params?: Record<string, string>): Promise<Paginated<AccessRuleDTO>> {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return apiFetch<Paginated<AccessRuleDTO>>(`${ACCESS_URL}/rules?page=${page}&limit=${limit}${qs}`);
}

export async function fetchRule(id: string): Promise<AccessRuleDTO> {
    return apiFetch<AccessRuleDTO>(`${ACCESS_URL}/rules/${id}`);
}

export async function createRule(data: CreateRuleRequest): Promise<AccessRuleDTO> {
    return apiFetch<AccessRuleDTO>(`${ACCESS_URL}/rules`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateRule(id: string, data: Partial<CreateRuleRequest>): Promise<AccessRuleDTO> {
    return apiFetch<AccessRuleDTO>(`${ACCESS_URL}/rules/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteRule(id: string): Promise<void> {
    await apiFetch<void>(`${ACCESS_URL}/rules/${id}`, { method: 'DELETE' });
}

export async function fetchSchedules(page = 1, limit = 50): Promise<Paginated<ScheduleDTO>> {
    return apiFetch<Paginated<ScheduleDTO>>(`${ACCESS_URL}/schedules?page=${page}&limit=${limit}`);
}

export async function createSchedule(data: CreateScheduleRequest): Promise<ScheduleDTO> {
    return apiFetch<ScheduleDTO>(`${ACCESS_URL}/schedules`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

// ─── Access Time API (access-svc :8003) ─────────────────────

export interface AccessTimeTemplateDTO {
    id: string;
    company_id: string;
    name: string;
    description?: string;
    timezone: string;
    is_active: boolean;
    created_by?: string;
    time_slots?: AccessTimeSlotDTO[];
    user_count?: number;
    created_at: string;
    updated_at: string;
}

export interface AccessTimeSlotDTO {
    id: string;
    template_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_name?: string;
    is_active: boolean;
    created_at: string;
}

export interface UserAccessTimeDTO {
    id: string;
    company_id: string;
    user_id: string;
    template_id: string;
    template?: AccessTimeTemplateDTO;
    effective_from: string;
    effective_to?: string;
    assigned_by?: string;
    created_at: string;
    updated_at: string;
}

export interface AccessTimeStatsDTO {
    templates_active: number;
    templates_total: number;
    users_assigned: number;
    validations_today: number;
    validations_allowed: number;
    validations_denied: number;
}

export interface ValidateAccessResponseDTO {
    is_allowed: boolean;
    reason: string;
    matched_slot?: AccessTimeSlotDTO;
    template?: AccessTimeTemplateDTO;
    next_allowed?: string;
}

export interface CreateAccessTimeTemplateRequest {
    name: string;
    description?: string;
    timezone: string;
    time_slots: {
        day_of_week: number;
        start_time: string;
        end_time: string;
        slot_name?: string;
        is_active: boolean;
    }[];
}

export interface UpdateAccessTimeTemplateRequest {
    name?: string;
    description?: string;
    timezone?: string;
    is_active?: boolean;
    time_slots?: {
        day_of_week: number;
        start_time: string;
        end_time: string;
        slot_name?: string;
        is_active: boolean;
    }[];
}

export interface AssignAccessTimeRequest {
    user_ids: string[];
    template_id: string;
    effective_from: string;
    effective_to?: string;
}

export interface ValidateAccessTimeRequest {
    user_id: string;
    requested_time: string;
    door_id?: string;
}

// Access Time Templates
export async function fetchAccessTimeTemplates(
    page = 1,
    limit = 50,
    params?: Record<string, string>,
): Promise<{ templates: AccessTimeTemplateDTO[]; pagination: { page: number; limit: number; total: number } }> {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return apiFetch(`${ACCESS_URL}/access-times/templates?page=${page}&limit=${limit}${qs}`);
}

export async function fetchAccessTimeTemplate(id: string): Promise<AccessTimeTemplateDTO> {
    return apiFetch<AccessTimeTemplateDTO>(`${ACCESS_URL}/access-times/templates/${id}`);
}

export async function createAccessTimeTemplate(data: CreateAccessTimeTemplateRequest): Promise<{ id: string; message: string }> {
    return apiFetch(`${ACCESS_URL}/access-times/templates`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateAccessTimeTemplate(id: string, data: UpdateAccessTimeTemplateRequest): Promise<{ message: string }> {
    return apiFetch(`${ACCESS_URL}/access-times/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteAccessTimeTemplate(id: string): Promise<{ message: string }> {
    return apiFetch(`${ACCESS_URL}/access-times/templates/${id}`, { method: 'DELETE' });
}

// Access Time User Assignment
export async function assignAccessTime(data: AssignAccessTimeRequest): Promise<{ message: string; assigned_users: number }> {
    return apiFetch(`${ACCESS_URL}/access-times/assign`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function fetchUserAccessTime(userId: string): Promise<{ user_id: string; assignments: UserAccessTimeDTO[] }> {
    return apiFetch(`${ACCESS_URL}/access-times/users/${userId}`);
}

// Access Time Validation & Stats
export async function validateAccessTime(data: ValidateAccessTimeRequest): Promise<ValidateAccessResponseDTO> {
    return apiFetch(`${ACCESS_URL}/access-times/validate`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function fetchAccessTimeStats(): Promise<AccessTimeStatsDTO> {
    return apiFetch(`${ACCESS_URL}/access-times/stats`);
}

// ─── Identity API (identity-svc :8004) ──────────────────────

export interface PersonDTO {
    id: string;
    company_id: string;
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
    company_id: string;
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
    company_id: string;
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
    return apiFetch<Paginated<PersonDTO>>(`${IDENTITY_URL}/users?page=${page}&limit=${limit}${qs}`);
}

export async function fetchPerson(id: string): Promise<PersonDTO> {
    return apiFetch<PersonDTO>(`${IDENTITY_URL}/users/${id}`);
}

export async function createPerson(data: CreatePersonRequest): Promise<PersonDTO> {
    return apiFetch<PersonDTO>(`${IDENTITY_URL}/users`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updatePerson(id: string, data: Partial<CreatePersonRequest>): Promise<PersonDTO> {
    return apiFetch<PersonDTO>(`${IDENTITY_URL}/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deletePerson(id: string): Promise<void> {
    await apiFetch<void>(`${IDENTITY_URL}/users/${id}`, { method: 'DELETE' });
}

export async function fetchCredentials(personId: string): Promise<CredentialDTO[]> {
    return apiFetch<CredentialDTO[]>(`${IDENTITY_URL}/users/${personId}/credentials`);
}

export async function createCredential(personId: string, data: CreateCredentialRequest): Promise<CredentialDTO> {
    return apiFetch<CredentialDTO>(`${IDENTITY_URL}/users/${personId}/credentials`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function deleteCredential(personId: string, credId: string): Promise<void> {
    await apiFetch<void>(`${IDENTITY_URL}/users/${personId}/credentials/${credId}`, { method: 'DELETE' });
}

export async function uploadPhoto(personId: string, file: File): Promise<{ photo_url: string }> {
    const formData = new FormData();
    formData.append('photo', file);

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${IDENTITY_URL}/users/${personId}/photo`, {
        method: 'POST',
        headers,
        body: formData,
    });

    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
}

export async function fetchGroups(page = 1, limit = 50): Promise<Paginated<PersonGroupDTO>> {
    return apiFetch<Paginated<PersonGroupDTO>>(`${IDENTITY_URL}/groups?page=${page}&limit=${limit}`);
}

export async function createGroup(data: CreateGroupRequest): Promise<PersonGroupDTO> {
    return apiFetch<PersonGroupDTO>(`${IDENTITY_URL}/groups`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateGroup(id: string, data: Partial<CreateGroupRequest>): Promise<PersonGroupDTO> {
    return apiFetch<PersonGroupDTO>(`${IDENTITY_URL}/groups/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteGroup(id: string): Promise<void> {
    await apiFetch<void>(`${IDENTITY_URL}/groups/${id}`, { method: 'DELETE' });
}

export async function fetchGroupMembers(groupId: string): Promise<PersonDTO[]> {
    return apiFetch<PersonDTO[]>(`${IDENTITY_URL}/groups/${groupId}/members`);
}

export async function addGroupMember(groupId: string, personId: string): Promise<void> {
    await apiFetch<void>(`${IDENTITY_URL}/groups/${groupId}/members`, {
        method: 'POST',
        body: JSON.stringify({ person_id: personId }),
    });
}

export async function removeGroupMember(groupId: string, personId: string): Promise<void> {
    await apiFetch<void>(`${IDENTITY_URL}/groups/${groupId}/members/${personId}`, { method: 'DELETE' });
}

export async function sendDeviceCommand(deviceId: string, command: string, params?: Record<string, unknown>): Promise<void> {
    await apiFetch<void>(`${GATEWAY_URL}/devices/${deviceId}/command`, {
        method: 'POST',
        // Backend expects { type, data } — map from legacy { command, params }
        body: JSON.stringify({ type: command, data: params || {} }),
    });
}

export async function fetchDeviceEvents(deviceId: string, page = 1, limit = 20): Promise<Paginated<EventDTO>> {
    return apiFetch<Paginated<EventDTO>>(`${GATEWAY_URL}/devices/${deviceId}/events?page=${page}&limit=${limit}`);
}

export interface DeviceHistoryEvent {
    id: string;
    time: string;
    device_id: string;
    event_type: string; // online, offline, command, door_command, sync, emergency, config_ack, error
    description: string;
    actor_id: string;
    actor_email: string;
    metadata: Record<string, unknown>;
}

export async function fetchDeviceHistory(deviceId: string, page = 1, limit = 50): Promise<Paginated<DeviceHistoryEvent>> {
    return apiFetch<Paginated<DeviceHistoryEvent>>(`${GATEWAY_URL}/devices/${deviceId}/history?page=${page}&limit=${limit}`);
}

// ─── System Admin API (auth-svc :8005) ──────────────────────

const AUTH_SYSTEM_URL = `${AUTH_URL}/system`;

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
    return apiFetch<SystemStatsDTO>(`${AUTH_SYSTEM_URL}/stats`);
}

// ─── Companies ──────────────────────────────────────────────

export async function fetchCompanies(): Promise<CompanyDTO[]> {
    // Backend caps `limit` at 100 and the companies list is the whole tenant
    // registry (system-admin view), so walk every page until exhausted.
    // Client-side search/sort in CompanyListPage depends on having the full set.
    const limit = 100;
    const all: CompanyDTO[] = [];
    for (let page = 1; page <= 100; page++) {
        const res = await apiFetch<{ data: CompanyDTO[]; total?: number } | CompanyDTO[]>(
            `${AUTH_SYSTEM_URL}/companies?page=${page}&limit=${limit}`,
        );
        if (Array.isArray(res)) {
            all.push(...res);
            if (res.length < limit) break;
        } else {
            all.push(...res.data);
            const total = typeof res.total === 'number' ? res.total : all.length;
            if (all.length >= total || res.data.length < limit) break;
        }
    }
    return all;
}

export async function fetchCompany(id: string): Promise<CompanyDTO> {
    return apiFetch<CompanyDTO>(`${AUTH_SYSTEM_URL}/companies/${id}`);
}

export async function createCompany(data: CreateCompanyRequest): Promise<CreateCompanyResponse> {
    return apiFetch<CreateCompanyResponse>(`${AUTH_SYSTEM_URL}/companies`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateCompany(id: string, data: Partial<CreateCompanyRequest>): Promise<CompanyDTO> {
    return apiFetch<CompanyDTO>(`${AUTH_SYSTEM_URL}/companies/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function suspendCompany(id: string): Promise<void> {
    await apiFetch<void>(`${AUTH_SYSTEM_URL}/companies/${id}`, { method: 'DELETE' });
}

// ─── Plugins ────────────────────────────────────────────────

export interface PluginInfo {
    id: string;
    name: string;
    description: string;
    category: string;
    is_core: boolean;
}

export interface TenantPluginsDTO {
    tenant_id: string;
    enabled_plugins: string[];
    available_plugins: PluginInfo[];
}

export async function fetchAvailablePlugins(): Promise<PluginInfo[]> {
    return apiFetch<PluginInfo[]>(`${AUTH_SYSTEM_URL}/plugins`);
}

export async function fetchTenantPlugins(id: string): Promise<TenantPluginsDTO> {
    return apiFetch<TenantPluginsDTO>(`${AUTH_SYSTEM_URL}/companies/${id}/plugins`);
}

export async function updateTenantPlugins(id: string, enabledPlugins: string[]): Promise<TenantPluginsDTO> {
    return apiFetch<TenantPluginsDTO>(`${AUTH_SYSTEM_URL}/companies/${id}/plugins`, {
        method: 'PUT',
        body: JSON.stringify({ enabled_plugins: enabledPlugins }),
    });
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
    time: string;
    tenant_id?: string;
    actor_id?: string;
    actor_email?: string;
    actor_ip?: string;
    user_agent?: string;
    service: string;
    action: string;
    entity_type: string;
    entity_id?: string;
    entity_name?: string;
    status: string;
    old_values?: Record<string, unknown>;
    new_values?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
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

export async function fetchAccounts(page = 1, limit = 20, params?: Record<string, string>): Promise<Paginated<AccountDTO>> {
    const qs = params ? '&' + new URLSearchParams(params).toString() : '';
    return apiFetch<Paginated<AccountDTO>>(`${AUTH_SYSTEM_URL}/accounts?page=${page}&limit=${limit}${qs}`);
}

export async function fetchAccount(id: string): Promise<AccountDTO> {
    return apiFetch<AccountDTO>(`${AUTH_SYSTEM_URL}/accounts/${id}`);
}

export async function createAccount(data: CreateAccountRequest): Promise<CreateAccountResponse> {
    return apiFetch<CreateAccountResponse>(`${AUTH_SYSTEM_URL}/accounts`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function updateAccount(id: string, data: UpdateAccountRequest): Promise<AccountDTO> {
    return apiFetch<AccountDTO>(`${AUTH_SYSTEM_URL}/accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
}

export async function suspendAccount(id: string): Promise<void> {
    await apiFetch<void>(`${AUTH_SYSTEM_URL}/accounts/${id}/suspend`, { method: 'POST' });
}

export async function reactivateAccount(id: string): Promise<void> {
    await apiFetch<void>(`${AUTH_SYSTEM_URL}/accounts/${id}/reactivate`, { method: 'POST' });
}

export async function fetchAccountAudit(id: string, page = 1, limit = 20): Promise<Paginated<AuditEntryDTO>> {
    return apiFetch<Paginated<AuditEntryDTO>>(`${AUTH_SYSTEM_URL}/accounts/${id}/audit?page=${page}&limit=${limit}`);
}

// ─── Audit Log APIs ────────────────────────────────────────────────────────
const AUDIT_URL = '/api/v1/audit';

export interface AuditFilters {
    tenant_id?: string;
    actor_id?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    service?: string;
    status?: string;
    from?: string;
    to?: string;
    search?: string;
}

export interface AuditStatsDTO {
    stats: { action: string; count: number }[];
    by_service: { service: string; count: number }[];
    total: number;
}

export async function fetchAuditLogs(page = 1, limit = 50, filters?: AuditFilters): Promise<Paginated<AuditEntryDTO>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters) {
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    return apiFetch<Paginated<AuditEntryDTO>>(`${AUDIT_URL}/logs?${params}`);
}

export async function fetchTenantAuditLogs(page = 1, limit = 50, filters?: AuditFilters): Promise<Paginated<AuditEntryDTO>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters) {
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    return apiFetch<Paginated<AuditEntryDTO>>(`${AUDIT_URL}/tenant/logs?${params}`);
}

export async function fetchAuditStats(filters?: { from?: string; to?: string; tenant_id?: string }): Promise<AuditStatsDTO> {
    const params = new URLSearchParams();
    if (filters) {
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    return apiFetch<AuditStatsDTO>(`${AUDIT_URL}/stats?${params}`);
}

export function exportAuditLogsUrl(filters?: AuditFilters): string {
    const params = new URLSearchParams();
    if (filters) {
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    return `${AUDIT_URL}/export?${params}`;
}

// ─── System Admin Device APIs ────────────────────────────────

export async function fetchSystemDevices(params?: Record<string, string>): Promise<any[]> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<any[]>(`${GATEWAY_URL}/system/devices${qs}`);
}

export interface EMQXClientDTO {
    client_id: string;
    username: string;
    ip_address: string;
    port: number;
    listener: string;
    conn_type: string; // "tcp" or "ssl"
    connected: boolean;
    connected_at: string;
    proto_ver: number;
    keepalive: number;
    recv_msg: number;
    send_msg: number;
    recv_oct: number;
    send_oct: number;
    subscriptions_cnt: number;
}

export async function fetchEMQXClients(): Promise<EMQXClientDTO[]> {
    return apiFetch<EMQXClientDTO[]>(`${GATEWAY_URL}/system/emqx/clients`);
}

export interface SystemDeviceDTO {
    id: string;
    device_id: string;
    name: string;
    model: string;
    tenant_id: string;
    status: string;
}

export async function fetchSystemDevice(id: string): Promise<SystemDeviceDTO> {
    return apiFetch<SystemDeviceDTO>(`${GATEWAY_URL}/system/devices/${id}`);
}

export async function updateSystemDevice(id: string, data: Partial<Pick<SystemDeviceDTO, 'name' | 'model' | 'status'>>): Promise<SystemDeviceDTO> {
    return apiFetch<SystemDeviceDTO>(`${GATEWAY_URL}/system/devices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

// ─── Device Provisioning API (device-gateway :8002) ─────────

export interface ProvisionRequest {
    device_id: string;
    name: string;
    type: string;
    tenant_id?: string;
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
        tenant_id: string;
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
    tenant_id: string;
    name: string;
    location?: string;
    type?: string;
    model?: string;
}

export async function provisionDevice(data: ProvisionRequest): Promise<ProvisionResponse> {
    return apiFetch<ProvisionResponse>(`${GATEWAY_URL}/devices/provision`, {
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
    return apiFetch<RegenerateQRResponse>(`${GATEWAY_URL}/devices/provision/${deviceDbId}/qr`);
}

export async function fetchPendingDevices(): Promise<PendingDevice[]> {
    const res = await apiFetch<{ data: PendingDevice[] } | PendingDevice[]>(`${GATEWAY_URL}/devices/pending`);
    return Array.isArray(res) ? res : res.data;
}

export async function approvePendingDevice(id: string, data: ApproveRequest): Promise<void> {
    await apiFetch<void>(`${GATEWAY_URL}/devices/pending/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify(data),
    });
}

export async function rejectPendingDevice(id: string): Promise<void> {
    await apiFetch<void>(`${GATEWAY_URL}/devices/pending/${id}/reject`, {
        method: 'POST',
    });
}

export async function fetchDevice(id: string): Promise<DeviceDTO> {
    return apiFetch<DeviceDTO>(`${GATEWAY_URL}/devices/${id}`);
}

export async function updateDevice(id: string, data: Record<string, unknown>): Promise<DeviceDTO> {
    return apiFetch<DeviceDTO>(`${GATEWAY_URL}/devices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteDevice(id: string): Promise<void> {
    await apiFetch<void>(`${GATEWAY_URL}/devices/${id}`, { method: 'DELETE' });
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
        } catch {
            /* ignore parse errors */
        }
    };

    ws.onerror = () => {
        console.warn('[WS] connection error');
    };

    return ws;
}

// ─── Firmware API ───────────────────────────────────────────

const FIRMWARE_URL = `${GATEWAY_URL}/system/firmware`;

export interface FirmwareDTO {
    id: string;
    version: string;
    device_type: string;
    description: string | null;
    file_path: string;
    file_size: number;
    checksum: string | null;
    is_active: boolean;
    uploaded_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface FirmwareListResponse {
    firmwares: FirmwareDTO[];
    pagination: { page: number; limit: number; total: number };
}

export interface FirmwareUploadResponse {
    id: string;
    checksum: string;
    size: number;
    message: string;
}

export async function fetchFirmwares(params?: Record<string, string>): Promise<FirmwareListResponse> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<FirmwareListResponse>(`${FIRMWARE_URL}${qs}`);
}

export async function fetchFirmware(id: string): Promise<FirmwareDTO> {
    return apiFetch<FirmwareDTO>(`${FIRMWARE_URL}/${id}`);
}

export async function uploadFirmware(
    file: File,
    version: string,
    deviceType: string,
    description: string,
    onProgress?: (pct: number) => void,
): Promise<FirmwareUploadResponse> {
    const token = getToken();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('version', version);
    formData.append('device_type', deviceType);
    formData.append('description', description);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', FIRMWARE_URL);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
            }
        };

        xhr.onerror = () => reject(new Error('Upload network error'));
        xhr.send(formData);
    });
}

export async function updateFirmware(id: string, data: { version?: string; description?: string; is_active?: boolean }): Promise<FirmwareDTO> {
    return apiFetch<FirmwareDTO>(`${FIRMWARE_URL}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
    });
}

export async function deleteFirmware(id: string): Promise<void> {
    await apiFetch<void>(`${FIRMWARE_URL}/${id}`, { method: 'DELETE' });
}

export interface FirmwareDeployResult {
    deployment_id: string;
    device_id: string;
    status: string;
    error?: string;
}

export interface FirmwareDeployResponse {
    firmware_id: string;
    version: string;
    device_type: string;
    expires_at: string;
    results: FirmwareDeployResult[];
}

export async function deployFirmware(firmwareId: string, deviceIds: string[], force = false): Promise<FirmwareDeployResponse> {
    return apiFetch<FirmwareDeployResponse>(`${FIRMWARE_URL}/${firmwareId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({ device_ids: deviceIds, force }),
    });
}

export interface FirmwareDeploymentDTO {
    id: string;
    firmware_id: string;
    device_id: string;
    version: string;
    device_type: string;
    status: string; // pending | sent | downloading | installing | success | failed | expired
    error_message: string;
    progress_pct: number;
    deployed_by_email: string;
    sent_at?: string;
    download_started_at?: string;
    install_started_at?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
}

export async function fetchFirmwareDeployments(firmwareId: string, page = 1, limit = 20): Promise<Paginated<FirmwareDeploymentDTO>> {
    return apiFetch<Paginated<FirmwareDeploymentDTO>>(`${FIRMWARE_URL}/${firmwareId}/deployments?page=${page}&limit=${limit}`);
}

export async function fetchFirmwareDeviceTypes(): Promise<{ device_types: string[] }> {
    return apiFetch<{ device_types: string[] }>(`${FIRMWARE_URL}/device-types`);
}

export function getFirmwareDownloadUrl(id: string): string {
    return `${FIRMWARE_URL}/${id}/download`;
}

export async function downloadFirmware(id: string): Promise<void> {
    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(getFirmwareDownloadUrl(id), {
        method: 'GET',
        headers,
    });
    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Download failed: ${response.status} ${text}`.trim());
    }

    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = match?.[1] || `firmware-${id}.bin`;
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
}

// ─── Notification APIs ──────────────────────────────────────────────────────
const NOTIFY_URL = '/api/v1/notifications';

export interface NotificationDTO {
    id: string;
    tenant_id: string;
    user_id?: string;
    title: string;
    message: string;
    type: string;
    severity: 'critical' | 'warning' | 'info';
    status: 'unread' | 'read' | 'acknowledged';
    source: string;
    reference_type?: string;
    reference_id?: string;
    metadata?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
    read_at?: string;
    acknowledged_at?: string;
}

export interface NotificationFilters {
    status?: string;
    severity?: string;
    type?: string;
    source?: string;
    from?: string;
    to?: string;
    search?: string;
}

export async function fetchNotifications(page = 1, limit = 20, filters?: NotificationFilters): Promise<Paginated<NotificationDTO>> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters) {
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    }
    return apiFetch<Paginated<NotificationDTO>>(`${NOTIFY_URL}?${params}`);
}

export async function fetchUnreadCount(): Promise<{ count: number }> {
    return apiFetch<{ count: number }>(`${NOTIFY_URL}/unread-count`);
}

export async function markNotificationRead(id: string): Promise<NotificationDTO> {
    return apiFetch<NotificationDTO>(`${NOTIFY_URL}/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
    return apiFetch<{ updated: number }>(`${NOTIFY_URL}/mark-all-read`, { method: 'PATCH' });
}

export async function acknowledgeNotification(id: string): Promise<NotificationDTO> {
    return apiFetch<NotificationDTO>(`${NOTIFY_URL}/${id}/acknowledge`, { method: 'PATCH' });
}

export async function deleteNotification(id: string): Promise<void> {
    return apiFetch<void>(`${NOTIFY_URL}/${id}`, { method: 'DELETE' });
}

// ─── RBAC — company roles, permissions, assignments ──────────────────────────

const RBAC_URL = '/api/v1/rbac';

export interface RbacPermissionDTO {
    key: string;
    domain: string;
    resource?: string;
    action: string;
    plugin: string;
    scope_types: string[];
    description?: string;
}

export interface RbacRoleDTO {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    template_key?: string;
    is_system_template_copy: boolean;
    status: string;
    permissions: string[];
    assignment_count: number;
    created_at: string;
    updated_at: string;
}

export interface RbacRoleWriteRequest {
    name: string;
    description?: string;
    template_key?: string;
    permissions: string[];
    status?: string;
}

export interface RbacAssignmentDTO {
    id: string;
    account_id: string;
    account_email?: string;
    role_id: string;
    role_name?: string;
    scope_type: 'company' | 'site' | 'department' | 'zone' | 'self';
    scope_id?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
    created_at: string;
}

export interface RbacAssignmentCreateRequest {
    account_id: string;
    role_id: string;
    scope_type: 'company' | 'site' | 'department' | 'zone' | 'self';
    scope_id?: string | null;
    effective_from?: string | null;
    effective_to?: string | null;
}

export interface RbacEligibleAccountDTO {
    id: string;
    email: string;
    full_name: string;
    role: string;
    status: string;
}

function rbacTenantQuery(tenantId?: string): string {
    return tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
}

export async function listRbacPermissions(): Promise<RbacPermissionDTO[]> {
    const res = await apiFetch<{ data: RbacPermissionDTO[] }>(`${RBAC_URL}/permissions`);
    return res.data;
}

export async function listRbacEligibleAccounts(tenantId?: string): Promise<RbacEligibleAccountDTO[]> {
    const res = await apiFetch<{ data: RbacEligibleAccountDTO[] }>(`${RBAC_URL}/accounts${rbacTenantQuery(tenantId)}`);
    return res.data;
}

export async function listRbacRoles(tenantId?: string): Promise<RbacRoleDTO[]> {
    const res = await apiFetch<{ data: RbacRoleDTO[] }>(`${RBAC_URL}/roles${rbacTenantQuery(tenantId)}`);
    return res.data;
}

export async function getRbacRole(id: string, tenantId?: string): Promise<RbacRoleDTO> {
    return apiFetch<RbacRoleDTO>(`${RBAC_URL}/roles/${id}${rbacTenantQuery(tenantId)}`);
}

export async function createRbacRole(payload: RbacRoleWriteRequest, tenantId?: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`${RBAC_URL}/roles${rbacTenantQuery(tenantId)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function updateRbacRole(id: string, payload: RbacRoleWriteRequest, tenantId?: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`${RBAC_URL}/roles/${id}${rbacTenantQuery(tenantId)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

export async function deleteRbacRole(id: string, tenantId?: string): Promise<void> {
    return apiFetch<void>(`${RBAC_URL}/roles/${id}${rbacTenantQuery(tenantId)}`, { method: 'DELETE' });
}

export async function listRbacAssignments(params?: {
    accountId?: string;
    roleId?: string;
    tenantId?: string;
}): Promise<RbacAssignmentDTO[]> {
    const q = new URLSearchParams();
    if (params?.accountId) q.set('account_id', params.accountId);
    if (params?.roleId) q.set('role_id', params.roleId);
    if (params?.tenantId) q.set('tenant_id', params.tenantId);
    const qs = q.toString();
    const url = `${RBAC_URL}/assignments${qs ? `?${qs}` : ''}`;
    const res = await apiFetch<{ data: RbacAssignmentDTO[] }>(url);
    return res.data;
}

export async function createRbacAssignment(payload: RbacAssignmentCreateRequest, tenantId?: string): Promise<{ id: string }> {
    return apiFetch<{ id: string }>(`${RBAC_URL}/assignments${rbacTenantQuery(tenantId)}`, {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

export async function deleteRbacAssignment(id: string, tenantId?: string): Promise<void> {
    return apiFetch<void>(`${RBAC_URL}/assignments/${id}${rbacTenantQuery(tenantId)}`, { method: 'DELETE' });
}
