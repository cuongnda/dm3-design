import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/cctv';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface CameraDTO {
  id: string;
  tenant_id: string;
  device_id: string;
  access_point_id?: string;
  name: string;
  status: string;
  last_seen?: string;
  brand?: string;
  model?: string;
  rtsp_url: string;
  rtsp_username?: string;
  recording_mode: 'event_only' | 'disabled';
  pre_roll_sec: number;
  post_roll_sec: number;
  last_checked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ClipDTO {
  id: string;
  tenant_id: string;
  camera_id: string;
  camera_name?: string;
  access_event_id?: string;
  started_at: string;
  ended_at?: string;
  duration_sec?: number;
  storage_ref?: string;
  thumbnail_ref?: string;
  size_bytes?: number;
  created_at: string;
}

export interface CCTVSettingsDTO {
  tenant_id: string;
  retention_days: number;
  retention_days_max: number;
  pre_roll_sec_default: number;
  post_roll_sec_default: number;
  storage_quota_gb: number;

  // Event capture knobs (migration 000048)
  rolling_buffer_sec: number;
  max_clip_duration_sec: number;
  max_concurrent_extractions: number;
  default_snapshot_enabled: boolean;
  default_record_enabled: boolean;

  created_at: string;
  updated_at: string;

  // Hanet integration. Secrets are never returned in plaintext — only
  // `has_*` booleans so the UI can show "configured" state without echoing
  // the token back. To replace a secret, PUT a new string in the
  // corresponding `hanet_*` field on UpdateCCTVSettingsRequest; to clear,
  // PUT the empty string.
  hanet_client_id: string;
  hanet_server_url: string;
  hanet_place_id: string;
  has_hanet_client_secret: boolean;
  has_hanet_access_token: boolean;
  has_hanet_refresh_token: boolean;
}

export interface HanetPlaceDTO {
  id: string;
  name: string;
}

export interface StreamUrlsDTO {
  whep_url: string;
  hls_url: string;
}

export interface ClipPlaybackDTO {
  playback_url: string;
  started_at: string;
  ended_at?: string;
  duration_ms?: number;
}

export interface TestConnectionDTO {
  ok: boolean;
  latency_ms?: number;
  codec?: string;
  resolution?: string;
  error?: string;
}

// ─── Request types ────────────────────────────────────────────────────────────

export interface CreateCameraRequest {
  name: string;
  access_point_id?: string;
  rtsp_url?: string;
  rtsp_username?: string;
  rtsp_password?: string;
  brand?: string;
  recording_mode?: 'event_only' | 'disabled';
  pre_roll_sec?: number;
  post_roll_sec?: number;
}

export interface UpdateCameraRequest {
  name?: string;
  access_point_id?: string;
  rtsp_url?: string;
  rtsp_username?: string;
  rtsp_password?: string;
  brand?: string;
  recording_mode?: 'event_only' | 'disabled';
  pre_roll_sec?: number;
  post_roll_sec?: number;
}

export interface UpdateCCTVSettingsRequest {
  retention_days?: number;
  pre_roll_sec_default?: number;
  post_roll_sec_default?: number;
  storage_quota_gb?: number;

  // Event capture knobs (migration 000048)
  rolling_buffer_sec?: number;
  max_clip_duration_sec?: number;
  max_concurrent_extractions?: number;
  default_snapshot_enabled?: boolean;
  default_record_enabled?: boolean;

  // Hanet fields. Field semantics per key:
  //   - omit        -> keep current value
  //   - empty ""    -> clear (NULL on the server)
  //   - non-empty   -> replace (encrypted on the server before storage)
  hanet_client_id?: string;
  hanet_client_secret?: string;
  hanet_access_token?: string;
  hanet_refresh_token?: string;
  hanet_server_url?: string;
  hanet_place_id?: string;
}

// ─── Event rules ──────────────────────────────────────────────────────────
// See backend migration 000048 for scope precedence (camera > access_point >
// tenant) and resolver semantics.

export type EventRuleScope = 'tenant' | 'access_point' | 'camera';

export interface EventRuleDTO {
  id: string;
  tenant_id: string;
  scope_kind: EventRuleScope;
  access_point_id?: string;
  camera_device_id?: string;
  decisions: string[];   // empty = match any
  event_types: string[]; // empty = match any
  snapshot_enabled: boolean;
  record_enabled: boolean;
  pre_roll_sec: number;
  post_roll_sec: number;
  priority: number;
  enabled: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface EventRuleInput {
  scope_kind: EventRuleScope;
  access_point_id?: string | null;
  camera_device_id?: string | null;
  decisions?: string[];
  event_types?: string[];
  snapshot_enabled?: boolean;
  record_enabled?: boolean;
  pre_roll_sec?: number;
  post_roll_sec?: number;
  priority?: number;
  enabled?: boolean;
  notes?: string | null;
}

export interface ListCamerasParams {
  access_point_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListClipsParams {
  camera_id?: string;
  access_event_id?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withQuery<T extends object>(path: string, params?: T): string {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

// ─── Cameras ─────────────────────────────────────────────────────────────────

export function listCameras(params?: ListCamerasParams): Promise<Paginated<CameraDTO>> {
  return apiFetch(withQuery(`${BASE}/cameras`, params));
}

export function getCamera(id: string): Promise<CameraDTO> {
  return apiFetch(`${BASE}/cameras/${id}`);
}

export function createCamera(data: CreateCameraRequest): Promise<CameraDTO> {
  return apiFetch(`${BASE}/cameras`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateCamera(id: string, data: UpdateCameraRequest): Promise<CameraDTO> {
  return apiFetch(`${BASE}/cameras/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export interface DeleteCameraPreview {
  camera_name: string;
  event_clips: number;
  sync_queue_entries: number;
  access_point_links: number;
}

export function deleteCameraPreview(id: string): Promise<DeleteCameraPreview> {
  return apiFetch(`${BASE}/cameras/${id}/delete-preview`);
}

export function deleteCamera(id: string): Promise<void> {
  return apiFetch(`${BASE}/cameras/${id}`, { method: 'DELETE' });
}

export function testCameraConnection(id: string): Promise<TestConnectionDTO> {
  return apiFetch(`${BASE}/cameras/${id}/test-connection`, { method: 'POST' });
}

// ─── Streaming ────────────────────────────────────────────────────────────────

export function getCameraStreamUrls(id: string): Promise<StreamUrlsDTO> {
  return apiFetch(`${BASE}/cameras/${id}/whep`);
}

// ─── Clips ───────────────────────────────────────────────────────────────────

export function listClips(params?: ListClipsParams): Promise<Paginated<ClipDTO>> {
  return apiFetch(withQuery(`${BASE}/clips`, params));
}

export function getClip(id: string): Promise<ClipDTO> {
  return apiFetch(`${BASE}/clips/${id}`);
}

export function getClipPlayback(id: string): Promise<ClipPlaybackDTO> {
  return apiFetch(`${BASE}/clips/${id}/playback`);
}

export function deleteClip(id: string): Promise<void> {
  return apiFetch(`${BASE}/clips/${id}`, { method: 'DELETE' });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getCCTVSettings(): Promise<CCTVSettingsDTO> {
  return apiFetch(`${BASE}/settings`);
}

export function updateCCTVSettings(data: UpdateCCTVSettingsRequest): Promise<CCTVSettingsDTO> {
  return apiFetch(`${BASE}/settings`, { method: 'PUT', body: JSON.stringify(data) });
}

// ─── Hanet ───────────────────────────────────────────────────────────────────

/** Forwards to Hanet /place/getPlaces using the tenant's saved access token.
 *  Backend handles token refresh on 401 transparently; a 412 response
 *  indicates no access token is configured yet. */
export function listHanetPlaces(): Promise<HanetPlaceDTO[]> {
  return apiFetch(`${BASE}/hanet/places`);
}

// ─── Event rules ─────────────────────────────────────────────────────────────

export function listEventRules(): Promise<EventRuleDTO[]> {
  return apiFetch(`${BASE}/event-rules`);
}

export function createEventRule(data: EventRuleInput): Promise<EventRuleDTO> {
  return apiFetch(`${BASE}/event-rules`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateEventRule(id: string, data: EventRuleInput): Promise<EventRuleDTO> {
  return apiFetch(`${BASE}/event-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteEventRule(id: string): Promise<void> {
  return apiFetch(`${BASE}/event-rules/${id}`, { method: 'DELETE' });
}
