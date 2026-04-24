import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/visitors';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface VisitorDTO {
  id: string;
  tenant_id: string;
  first_name: string;
  last_name: string;
  display_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  national_id?: string;
  photo_ref?: string;
  watchlist_status: string;
  watchlist_reason?: string;
  visit_count: number;
  last_visit_at?: string;
  created_at: string;
  updated_at: string;
}

export interface VisitHostDTO {
  id: string;
  name: string;
  department?: string;
}

export interface VisitDTO {
  id: string;
  tenant_id: string;
  visitor_id: string;
  host_user_id: string;
  purpose: string;
  purpose_note?: string;
  status: string;
  expected_arrival: string;
  expected_departure?: string;
  actual_checkin?: string;
  actual_checkout?: string;
  checkin_method?: string;
  checkin_device_id?: string;
  checkin_photo_ref?: string;
  checkout_by?: string;
  qr_token: string;
  qr_expires_at: string;
  badge_number?: string;
  temp_credential_id?: string;
  access_areas?: string[];
  escort_required: boolean;
  vehicle_plate?: string;
  items_carried?: string;
  nda_signed: boolean;
  host_approved: boolean;
  host_approved_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  visitor?: VisitorDTO;
  host?: VisitHostDTO;
}

export interface VisitSummaryDTO {
  waiting: number;
  checked_in: number;
  checked_out: number;
  no_show: number;
  total_expected: number;
}

export interface WatchlistEntryDTO {
  id: string;
  tenant_id: string;
  entry_type: string;
  match_field: string;
  match_value: string;
  face_template_ref?: string;
  reason: string;
  added_by: string;
  expires_at?: string;
  created_at: string;
}

// ─── Request types ───────────────────────────────────────────────────────────

export interface CreateVisitRequest {
  visitor: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    company?: string;
  };
  /**
   * Host user UUID. Required only when the tenant's visitor settings have
   * `approval_required = true` (the server enforces this). When approval is
   * off, the visit auto-approves and the host can be left empty.
   */
  host_user_id?: string;
  purpose: string;
  purpose_note?: string;
  expected_arrival: string;
  expected_departure?: string;
  access_areas?: string[];
  escort_required?: boolean;
  vehicle_plate?: string;
}

export interface WalkinVisitRequest {
  visitor: {
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    company?: string;
    national_id?: string;
  };
  host_user_id?: string;
  purpose: string;
  purpose_note?: string;
  expected_departure?: string;
  access_areas?: string[];
  escort_required?: boolean;
  vehicle_plate?: string;
}

export interface UpdateVisitRequest {
  purpose?: string;
  purpose_note?: string;
  expected_arrival?: string;
  expected_departure?: string;
  access_areas?: string[];
  escort_required?: boolean;
  vehicle_plate?: string;
  notes?: string;
}

export interface CheckinRequest {
  checkin_method?: string;
  checkin_device_id?: string;
  badge_number?: string;
}

export interface CreateWatchlistRequest {
  entry_type: string;
  match_field: string;
  match_value: string;
  face_template_ref?: string;
  reason: string;
  expires_at?: string;
}

export interface ListVisitsParams {
  page?: number;
  limit?: number;
  status?: string;
  date?: string;
  host_id?: string;
  search?: string;
}

export interface ListWatchlistParams {
  page?: number;
  limit?: number;
  entry_type?: string;
}

// ─── Visit API ───────────────────────────────────────────────────────────────

export function listVisits(params?: ListVisitsParams): Promise<Paginated<VisitDTO>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.status) qs.set('status', params.status);
  if (params?.date) qs.set('date', params.date);
  if (params?.host_id) qs.set('host_id', params.host_id);
  if (params?.search) qs.set('search', params.search);
  const q = qs.toString();
  return apiFetch<Paginated<VisitDTO>>(`${BASE}/visits${q ? '?' + q : ''}`);
}

export function getVisit(id: string): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/visits/${id}`);
}

export function createVisit(data: CreateVisitRequest): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/visits`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateVisit(id: string, data: UpdateVisitRequest): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/visits/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function approveVisit(id: string, approved = true): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/visits/${id}/approve`, { method: 'POST', body: JSON.stringify({ approved }) });
}

export function checkinVisit(id: string, data?: CheckinRequest): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/visits/${id}/checkin`, { method: 'POST', body: JSON.stringify(data ?? {}) });
}

export function checkoutVisit(id: string): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/visits/${id}/checkout`, { method: 'POST', body: JSON.stringify({ badge_returned: true, items_returned: true }) });
}

export function walkinVisit(data: WalkinVisitRequest): Promise<VisitDTO> {
  return apiFetch<VisitDTO>(`${BASE}/walkin`, { method: 'POST', body: JSON.stringify(data) });
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function getTodaySummary(): Promise<VisitSummaryDTO> {
  return apiFetch<VisitSummaryDTO>(`${BASE}/today/summary`);
}

// ─── QR (public) ─────────────────────────────────────────────────────────────

export interface QRVisitResponse {
  visit_id: string;
  visitor_name: string;
  visitor_company?: string;
  purpose: string;
  expected_arrival: string;
  status: string;
}

export function getVisitByQR(token: string): Promise<QRVisitResponse> {
  return apiFetch<QRVisitResponse>(`${BASE}/qr/${token}`);
}

// ─── Watchlist ───────────────────────────────────────────────────────────────

export function listWatchlist(params?: ListWatchlistParams): Promise<Paginated<WatchlistEntryDTO>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.entry_type) qs.set('entry_type', params.entry_type);
  const q = qs.toString();
  return apiFetch<Paginated<WatchlistEntryDTO>>(`${BASE}/watchlist${q ? '?' + q : ''}`);
}

export function createWatchlistEntry(data: CreateWatchlistRequest): Promise<WatchlistEntryDTO> {
  return apiFetch<WatchlistEntryDTO>(`${BASE}/watchlist`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteWatchlistEntry(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/watchlist/${id}`, { method: 'DELETE' });
}

// ─── Reinvite ───────────────────────────────────────────────────────────────

export interface ReinviteResponse {
  qr_token: string;
  qr_expires_at: string;
  reinvite_count: number;
}

export function reinviteVisit(id: string): Promise<ReinviteResponse> {
  return apiFetch<ReinviteResponse>(`${BASE}/visits/${id}/reinvite`, { method: 'POST' });
}

// ─── Batch ──────────────────────────────────────────────────────────────────

export interface BatchCreateRequest {
  visits: CreateVisitRequest[];
}

export interface BatchCreateResponse {
  created: number;
  failed: number;
  errors?: string[];
}

export function batchCreateVisits(data: BatchCreateRequest): Promise<BatchCreateResponse> {
  return apiFetch<BatchCreateResponse>(`${BASE}/batch`, { method: 'POST', body: JSON.stringify(data) });
}

// ─── Visit Groups ───────────────────────────────────────────────────────────

export interface VisitGroupDTO {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  host_user_id: string;
  purpose: string;
  expected_arrival: string;
  expected_departure?: string;
  access_areas?: string[];
  escort_required: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
}

export interface CreateVisitGroupRequest {
  name: string;
  description?: string;
  /**
   * Host user UUID. Required only when the tenant's visitor settings have
   * `approval_required = true` (server-enforced). When approval is off, a
   * group can be registered without a designated host (e.g. open-house).
   */
  host_user_id?: string;
  purpose: string;
  expected_arrival: string;
  expected_departure?: string;
  access_areas?: string[];
  escort_required?: boolean;
}

export interface ListVisitGroupsParams {
  page?: number;
  limit?: number;
  search?: string;
}

export function listVisitGroups(params?: ListVisitGroupsParams): Promise<Paginated<VisitGroupDTO>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  const q = qs.toString();
  return apiFetch<Paginated<VisitGroupDTO>>(`${BASE}/groups${q ? '?' + q : ''}`);
}

export function getVisitGroup(id: string): Promise<VisitGroupDTO> {
  return apiFetch<VisitGroupDTO>(`${BASE}/groups/${id}`);
}

export function createVisitGroup(data: CreateVisitGroupRequest): Promise<VisitGroupDTO> {
  return apiFetch<VisitGroupDTO>(`${BASE}/groups`, { method: 'POST', body: JSON.stringify(data) });
}

export function deleteVisitGroup(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/groups/${id}`, { method: 'DELETE' });
}

// ─── Visitor Access Log ─────────────────────────────────────────────────────

export interface VisitorAccessLogDTO {
  id: string;
  tenant_id: string;
  visit_id: string;
  visitor_id: string;
  access_event_id?: string;
  access_point_id?: string;
  access_point_name?: string;
  zone_id?: string;
  zone_name?: string;
  direction?: string;
  decision: string;
  event_time: string;
  credential_type?: string;
  created_at: string;
}

export interface ListAccessLogParams {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
}

export function listVisitAccessLog(visitId: string, params?: ListAccessLogParams): Promise<Paginated<VisitorAccessLogDTO>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch<Paginated<VisitorAccessLogDTO>>(`${BASE}/${visitId}/access-log${q ? '?' + q : ''}`);
}

export function listVisitorHistory(visitorId: string, params?: ListAccessLogParams): Promise<Paginated<VisitorAccessLogDTO>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch<Paginated<VisitorAccessLogDTO>>(`${BASE}/history/${visitorId}${q ? '?' + q : ''}`);
}

// ─── Evacuation ─────────────────────────────────────────────────────────────

export interface EvacuationEntry {
  visit_id: string;
  visitor_id: string;
  visitor_name: string;
  visitor_company?: string;
  visitor_phone?: string;
  visitor_photo_ref?: string;
  host_name: string;
  checkin_time?: string;
  last_access_point?: string;
  last_zone?: string;
  last_event_time?: string;
}

export function getEvacuationList(): Promise<EvacuationEntry[]> {
  return apiFetch<EvacuationEntry[]>(`${BASE}/evacuation`);
}

// ─── Agreements ─────────────────────────────────────────────────────────────

export interface AgreementDTO {
  id: string;
  tenant_id: string;
  name: string;
  content: string;
  version: number;
  active: boolean;
  required_for?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateAgreementRequest {
  name: string;
  content: string;
  required_for?: string[];
}

export interface AgreementSignatureDTO {
  id: string;
  tenant_id: string;
  agreement_id: string;
  visit_id: string;
  visitor_id: string;
  signature_ref?: string;
  signed_at: string;
}

export function listAgreements(): Promise<AgreementDTO[]> {
  return apiFetch<AgreementDTO[]>(`${BASE}/agreements`);
}

export function createAgreement(data: CreateAgreementRequest): Promise<AgreementDTO> {
  return apiFetch<AgreementDTO>(`${BASE}/agreements`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateAgreement(id: string, data: Partial<CreateAgreementRequest> & { active?: boolean }): Promise<AgreementDTO> {
  return apiFetch<AgreementDTO>(`${BASE}/agreements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function signAgreement(visitId: string, agreementId: string, visitorId: string, signatureRef?: string): Promise<AgreementSignatureDTO> {
  return apiFetch<AgreementSignatureDTO>(`${BASE}/visits/${visitId}/agreements/sign`, {
    method: 'POST',
    body: JSON.stringify({ agreement_id: agreementId, visitor_id: visitorId, signature_ref: signatureRef }),
  });
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface VisitorAnalyticsDTO {
  period: string;
  total_visits: number;
  unique_visitors: number;
  checked_in: number;
  no_shows: number;
  avg_duration_minutes: number | null;
  by_purpose: Record<string, number>;
  by_status: Record<string, number>;
  peak_hour: number | null;
  daily_trend?: { date: string; count: number }[];
}

export interface TopVisitorDTO {
  visitor_id: string;
  name: string;
  company?: string;
  visit_count: number;
  last_visit_at?: string;
}

export interface AnalyticsParams {
  period?: '7d' | '30d' | '90d';
}

export function getVisitorAnalytics(params?: AnalyticsParams): Promise<VisitorAnalyticsDTO> {
  const qs = new URLSearchParams();
  if (params?.period) qs.set('period', params.period);
  const q = qs.toString();
  return apiFetch<VisitorAnalyticsDTO>(`${BASE}/analytics${q ? '?' + q : ''}`);
}

export function getTopVisitors(params?: { limit?: number }): Promise<TopVisitorDTO[]> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<TopVisitorDTO[]>(`${BASE}/analytics/top-visitors${q ? '?' + q : ''}`);
}

// ─── Recurring Visit Templates ──────────────────────────────────────────────

export interface RecurringTemplateDTO {
  id: string;
  tenant_id: string;
  visitor_id: string;
  host_user_id: string;
  purpose: string;
  access_areas?: string[];
  escort_required: boolean;
  recurrence_rule: string;
  start_date: string;
  end_date?: string;
  active: boolean;
  last_generated?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  visitor?: VisitorDTO;
}

export interface CreateRecurringTemplateRequest {
  visitor_id: string;
  /**
   * Host user UUID. Required only when the tenant's visitor settings have
   * `approval_required = true` (server-enforced).
   */
  host_user_id?: string;
  purpose: string;
  recurrence_rule: string;
  start_date: string;
  end_date?: string;
  access_areas?: string[];
  escort_required?: boolean;
}

export function listRecurringTemplates(): Promise<Paginated<RecurringTemplateDTO>> {
  return apiFetch<Paginated<RecurringTemplateDTO>>(`${BASE}/recurring`);
}

export function createRecurringTemplate(data: CreateRecurringTemplateRequest): Promise<RecurringTemplateDTO> {
  return apiFetch<RecurringTemplateDTO>(`${BASE}/recurring`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateRecurringTemplate(id: string, data: Partial<CreateRecurringTemplateRequest & { active: boolean }>): Promise<RecurringTemplateDTO> {
  return apiFetch<RecurringTemplateDTO>(`${BASE}/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteRecurringTemplate(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/recurring/${id}`, { method: 'DELETE' });
}

// ─── Visitor Settings ───────────────────────────────────────────────────────

export interface VisitorSettingsDTO {
  id: string;
  tenant_id: string;
  approval_required: boolean;
  auto_approve_returning: boolean;
  auto_approve_vip: boolean;
  approver_user_ids: string[];
  approval_timeout_hours: number;
  default_duration_hours: number;
  max_duration_hours: number;
  auto_checkout_hour: number;
  no_show_grace_minutes: number;
  qr_validity_before_hours: number;
  qr_validity_after_hours: number;
  require_email: boolean;
  require_phone: boolean;
  require_national_id: boolean;
  require_company: boolean;
  require_photo: boolean;
  require_nda: boolean;
  badge_enabled: boolean;
  badge_auto_assign: boolean;
  badge_prefix: string;
  badge_pool_size: number;
  notify_host_on_arrival: boolean;
  notify_host_on_register: boolean;
  notify_method: string;
  allowed_purposes?: string[];
  self_service_enabled: boolean;
  self_service_requires_qr: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateVisitorSettingsRequest {
  approval_required?: boolean;
  auto_approve_returning?: boolean;
  auto_approve_vip?: boolean;
  approver_user_ids?: string[];
  approval_timeout_hours?: number;
  default_duration_hours?: number;
  max_duration_hours?: number;
  auto_checkout_hour?: number;
  no_show_grace_minutes?: number;
  qr_validity_before_hours?: number;
  qr_validity_after_hours?: number;
  require_email?: boolean;
  require_phone?: boolean;
  require_national_id?: boolean;
  require_company?: boolean;
  require_photo?: boolean;
  require_nda?: boolean;
  badge_enabled?: boolean;
  badge_auto_assign?: boolean;
  badge_prefix?: string;
  badge_pool_size?: number;
  notify_host_on_arrival?: boolean;
  notify_host_on_register?: boolean;
  notify_method?: string;
  allowed_purposes?: string[];
  self_service_enabled?: boolean;
  self_service_requires_qr?: boolean;
}

export function getVisitorSettings(): Promise<VisitorSettingsDTO> {
  return apiFetch<VisitorSettingsDTO>(`${BASE}/settings`);
}

export function updateVisitorSettings(data: UpdateVisitorSettingsRequest): Promise<VisitorSettingsDTO> {
  return apiFetch<VisitorSettingsDTO>(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(data) });
}
