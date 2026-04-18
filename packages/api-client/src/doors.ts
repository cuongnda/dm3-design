import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/doors';

export interface DoorDTO {
  id: string;
  company_id: string;
  site_id?: string;
  zone_id?: string;
  name: string;
  description?: string;
  type: string;
  location: string;
  floor?: number;
  building?: string;
  status: string;
  state: string;
  mode: string;
  controller_id?: string;
  device_id?: string;
  firmware_version?: string;
  ip_address?: string;
  last_event_at?: string;
  last_heartbeat_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDoorRequest {
  name: string;
  type: string;
  location?: string;
  site_id?: string;
  zone_id?: string;
  floor?: number;
  building?: string;
  unlock_duration_ms?: number;
}

export interface ListDoorsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  state?: string;
  type?: string;
  site_id?: string;
  zone_id?: string;
}

export function listDoors(params?: ListDoorsParams): Promise<Paginated<DoorDTO>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.status) qs.set('status', params.status);
  if (params?.state) qs.set('state', params.state);
  if (params?.type) qs.set('type', params.type);
  if (params?.site_id) qs.set('site_id', params.site_id);
  if (params?.zone_id) qs.set('zone_id', params.zone_id);
  const q = qs.toString();
  return apiFetch<Paginated<DoorDTO>>(`${BASE}${q ? '?' + q : ''}`);
}

export function getDoor(id: string): Promise<DoorDTO> {
  return apiFetch<DoorDTO>(`${BASE}/${id}`);
}

export function createDoor(data: CreateDoorRequest): Promise<DoorDTO> {
  return apiFetch<DoorDTO>(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updateDoor(id: string, data: Partial<CreateDoorRequest>): Promise<DoorDTO> {
  return apiFetch<DoorDTO>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteDoor(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
