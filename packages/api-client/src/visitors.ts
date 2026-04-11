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
  host_user_id: string;
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
  return apiFetch<BatchCreateResponse>(`${BASE}/visits/batch`, { method: 'POST', body: JSON.stringify(data) });
}

// ─── Visit Groups ───────────────────────────────────────────────────────────

export interface VisitGroupDTO {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  visit_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreateVisitGroupRequest {
  name: string;
  description?: string;
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

export function updateVisitGroup(id: string, data: Partial<CreateVisitGroupRequest>): Promise<VisitGroupDTO> {
  return apiFetch<VisitGroupDTO>(`${BASE}/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) });
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
  access_point_id: string;
  access_point_name?: string;
  direction: string;
  granted: boolean;
  method: string;
  timestamp: string;
}

export interface ListAccessLogParams {
  page?: number;
  limit?: number;
  visitor_id?: string;
  visit_id?: string;
  from?: string;
  to?: string;
}

export function listVisitorAccessLog(params?: ListAccessLogParams): Promise<Paginated<VisitorAccessLogDTO>> {
  const qs = new URLSearchParams();
  if (params?.page != null) qs.set('page', String(params.page));
  if (params?.limit != null) qs.set('limit', String(params.limit));
  if (params?.visitor_id) qs.set('visitor_id', params.visitor_id);
  if (params?.visit_id) qs.set('visit_id', params.visit_id);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch<Paginated<VisitorAccessLogDTO>>(`${BASE}/access-log${q ? '?' + q : ''}`);
}

// ─── Evacuation ─────────────────────────────────────────────────────────────

export interface EvacuationResponse {
  checked_out: number;
  already_out: number;
}

export function triggerEvacuation(): Promise<EvacuationResponse> {
  return apiFetch<EvacuationResponse>(`${BASE}/evacuate`, { method: 'POST' });
}

// ─── Agreements ─────────────────────────────────────────────────────────────

export interface AgreementDTO {
  id: string;
  tenant_id: string;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  requires_signature: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAgreementRequest {
  title: string;
  content: string;
  requires_signature?: boolean;
}

export interface AgreementSignatureDTO {
  id: string;
  agreement_id: string;
  visit_id: string;
  visitor_id: string;
  signed_at: string;
  signature_data?: string;
}

export function listAgreements(): Promise<AgreementDTO[]> {
  return apiFetch<AgreementDTO[]>(`${BASE}/agreements`);
}

export function createAgreement(data: CreateAgreementRequest): Promise<AgreementDTO> {
  return apiFetch<AgreementDTO>(`${BASE}/agreements`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateAgreement(id: string, data: Partial<CreateAgreementRequest>): Promise<AgreementDTO> {
  return apiFetch<AgreementDTO>(`${BASE}/agreements/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteAgreement(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/agreements/${id}`, { method: 'DELETE' });
}

export function signAgreement(agreementId: string, visitId: string, signatureData?: string): Promise<AgreementSignatureDTO> {
  return apiFetch<AgreementSignatureDTO>(`${BASE}/agreements/${agreementId}/sign`, {
    method: 'POST',
    body: JSON.stringify({ visit_id: visitId, signature_data: signatureData }),
  });
}

// ─── Analytics ──────────────────────────────────────────────────────────────

export interface VisitorAnalyticsDTO {
  period: string;
  total_visits: number;
  unique_visitors: number;
  avg_duration_minutes: number;
  peak_hour: number;
  by_purpose: Record<string, number>;
  by_status: Record<string, number>;
}

export interface TopVisitorDTO {
  visitor_id: string;
  visitor_name: string;
  visitor_company?: string;
  visit_count: number;
  last_visit: string;
}

export interface AnalyticsParams {
  from?: string;
  to?: string;
  group_by?: 'day' | 'week' | 'month';
}

export function getVisitorAnalytics(params?: AnalyticsParams): Promise<VisitorAnalyticsDTO[]> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.group_by) qs.set('group_by', params.group_by);
  const q = qs.toString();
  return apiFetch<VisitorAnalyticsDTO[]>(`${BASE}/analytics${q ? '?' + q : ''}`);
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
  schedule_cron: string;
  schedule_description?: string;
  access_areas?: string[];
  is_active: boolean;
  next_visit_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateRecurringTemplateRequest {
  visitor_id: string;
  host_user_id: string;
  purpose: string;
  schedule_cron: string;
  schedule_description?: string;
  access_areas?: string[];
}

export function listRecurringTemplates(): Promise<RecurringTemplateDTO[]> {
  return apiFetch<RecurringTemplateDTO[]>(`${BASE}/recurring`);
}

export function createRecurringTemplate(data: CreateRecurringTemplateRequest): Promise<RecurringTemplateDTO> {
  return apiFetch<RecurringTemplateDTO>(`${BASE}/recurring`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateRecurringTemplate(id: string, data: Partial<CreateRecurringTemplateRequest & { is_active: boolean }>): Promise<RecurringTemplateDTO> {
  return apiFetch<RecurringTemplateDTO>(`${BASE}/recurring/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteRecurringTemplate(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/recurring/${id}`, { method: 'DELETE' });
}

// ─── Visitor Settings ───────────────────────────────────────────────────────

export interface VisitorSettingsDTO {
  tenant_id: string;
  require_approval: boolean;
  approval_roles: string[];
  require_nda: boolean;
  require_photo: boolean;
  require_id: boolean;
  require_phone: boolean;
  auto_checkout_hours: number;
  max_visit_duration_hours: number;
  qr_expiry_hours: number;
  max_reinvites: number;
  enable_watchlist: boolean;
  enable_recurring: boolean;
  custom_fields: Record<string, unknown>;
  updated_at: string;
}

export interface UpdateVisitorSettingsRequest {
  require_approval?: boolean;
  approval_roles?: string[];
  require_nda?: boolean;
  require_photo?: boolean;
  require_id?: boolean;
  require_phone?: boolean;
  auto_checkout_hours?: number;
  max_visit_duration_hours?: number;
  qr_expiry_hours?: number;
  max_reinvites?: number;
  enable_watchlist?: boolean;
  enable_recurring?: boolean;
  custom_fields?: Record<string, unknown>;
}

export function getVisitorSettings(): Promise<VisitorSettingsDTO> {
  return apiFetch<VisitorSettingsDTO>(`${BASE}/settings`);
}

export function updateVisitorSettings(data: UpdateVisitorSettingsRequest): Promise<VisitorSettingsDTO> {
  return apiFetch<VisitorSettingsDTO>(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(data) });
}
