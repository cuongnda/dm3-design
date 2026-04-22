import { apiFetch, getToken } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/access/events';

export interface AccessEventDTO {
  id: string;
  company_id: string;
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

export interface ListEventsParams {
  page?: number;
  limit?: number;
  door_id?: string;
  person_id?: string;
  decision?: string;
  from?: string;
  to?: string;
}

export function listEvents(params?: ListEventsParams): Promise<Paginated<AccessEventDTO>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.door_id) qs.set('door_id', params.door_id);
  if (params?.person_id) qs.set('person_id', params.person_id);
  if (params?.decision) qs.set('decision', params.decision);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch<Paginated<AccessEventDTO>>(`${BASE}${q ? '?' + q : ''}`);
}

// ─── Access Events (new paginated API with full field set) ──────────────────

export interface CCTVMediaItem {
  clip_id: string;
  camera_id: string;
  camera_name?: string;
  media_type: 'clip' | 'snapshot';
  status: 'pending' | 'recording' | 'finalized' | 'degraded' | 'failed';
  thumbnail_url?: string;
  playback_url?: string;
}

export interface AccessEventRecord {
  id: string;
  event_id?: string;
  tenant_id: string;
  time: string;
  access_point_id?: string;
  user_id?: string;
  user_name?: string;
  credential_type?: string;
  direction?: 'in' | 'out' | string;
  decision: 'granted' | 'denied' | string;
  reason?: string;
  confidence?: number;
  photo_ref?: string;
  /** 5-min presigned MinIO GET URL — populated when photo_ref looks like an
   * object key from the device media-upload flow. Empty for legacy
   * /photos/... refs (use assetUrl(photo_ref) as a fallback). */
  photo_url?: string;
  /** Per-camera captures from cctv-svc for this event (thumbnails + clips).
   * Populated when the access point has cameras bound and CCTV rules
   * matched. */
  cctv_media?: CCTVMediaItem[];
  device_id?: string;
  device_name?: string;
  metadata?: Record<string, unknown>;
}

export interface ListAccessEventsParams {
  page?: number;
  limit?: number;
  access_point_id?: string;
  user_id?: string;
  decision?: string;
  credential_type?: string;
  from?: string;
  to?: string;
}

export function listAccessEvents(
  params?: ListAccessEventsParams,
): Promise<Paginated<AccessEventRecord>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.access_point_id) qs.set('access_point_id', params.access_point_id);
  if (params?.user_id) qs.set('user_id', params.user_id);
  if (params?.decision) qs.set('decision', params.decision);
  if (params?.credential_type) qs.set('credential_type', params.credential_type);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch<Paginated<AccessEventRecord>>(`${BASE}${suffix}`);
}

export async function exportAccessEvents(
  params: ListAccessEventsParams | undefined,
  format: 'csv' | 'xlsx',
): Promise<Blob> {
  const qs = new URLSearchParams();
  qs.set('format', format);
  if (params?.access_point_id) qs.set('access_point_id', params.access_point_id);
  if (params?.user_id) qs.set('user_id', params.user_id);
  if (params?.decision) qs.set('decision', params.decision);
  if (params?.credential_type) qs.set('credential_type', params.credential_type);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}/export?${qs}`, { headers });
  if (res.status === 413) {
    throw new Error('export_too_large');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.blob();
}
