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
