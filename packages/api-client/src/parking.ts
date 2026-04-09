import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/parking';

export interface ParkingLotDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  name: string;
  code: string;
  description?: string;
  status: string;
  zone_count?: number;
  active_session_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ParkingZoneDTO {
  id: string;
  tenant_id: string;
  lot_id: string;
  site_id?: string;
  name: string;
  code: string;
  type: string;
  level?: string;
  total_spaces: number;
  vehicle_types?: string[];
  status: string;
  active_session_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ParkingVehicleDTO {
  id: string;
  tenant_id: string;
  owner_id?: string;
  plate_number: string;
  normalized_plate_number: string;
  plate_image_ref?: string;
  type: string;
  category: string;
  brand?: string;
  color?: string;
  registration_status: string;
  monthly_pass_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ParkingSessionDTO {
  id: string;
  tenant_id: string;
  lot_id: string;
  zone_id: string;
  vehicle_id?: string;
  plate_number: string;
  normalized_plate_number: string;
  vehicle_type: string;
  vehicle_category?: string;
  entry_time: string;
  exit_time?: string;
  entry_device_id?: string;
  exit_device_id?: string;
  entry_plate_image?: string;
  exit_plate_image?: string;
  status: string;
  fee_amount?: number;
  fee_currency: string;
  fee_rule_id?: string;
  payment_status?: string;
  payment_method?: string;
  payment_ref?: string;
  monthly_pass_id?: string;
  duration_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface ListParkingLotsParams {
  page?: number;
  limit?: number;
  site_id?: string;
  status?: string;
}

export interface ListParkingZonesParams {
  page?: number;
  limit?: number;
  lot_id?: string;
  site_id?: string;
  status?: string;
  type?: string;
  vehicle_type?: string;
}

export interface ListParkingVehiclesParams {
  page?: number;
  limit?: number;
  plate_number?: string;
  owner_id?: string;
  type?: string;
  registration_status?: string;
}

export interface ListParkingSessionsParams {
  page?: number;
  limit?: number;
  lot_id?: string;
  zone_id?: string;
  status?: string;
  plate_number?: string;
  vehicle_type?: string;
  from?: string;
  to?: string;
}

export interface CreateParkingVehicleRequest {
  owner_id?: string;
  plate_number: string;
  type: string;
  category?: string;
  brand?: string;
  color?: string;
  registration_status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateParkingSessionRequest {
  lot_id: string;
  zone_id: string;
  plate_number: string;
  vehicle_type: string;
  entry_device_id?: string;
  plate_image_ref?: string;
  metadata?: Record<string, unknown>;
}

export interface ExitParkingSessionRequest {
  exit_device_id?: string;
  plate_number?: string;
  plate_image_ref?: string;
}

function withQuery<T extends object>(path: string, params?: T) {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ''}`;
}

export function listParkingLots(params?: ListParkingLotsParams): Promise<Paginated<ParkingLotDTO>> {
  return apiFetch(withQuery(`${BASE}/lots`, params));
}

export function listParkingZones(params?: ListParkingZonesParams): Promise<Paginated<ParkingZoneDTO>> {
  return apiFetch(withQuery(`${BASE}/zones`, params));
}

export function listParkingVehicles(params?: ListParkingVehiclesParams): Promise<Paginated<ParkingVehicleDTO>> {
  return apiFetch(withQuery(`${BASE}/vehicles`, params));
}

export function getParkingVehicle(id: string): Promise<ParkingVehicleDTO> {
  return apiFetch(`${BASE}/vehicles/${id}`);
}

export function createParkingVehicle(data: CreateParkingVehicleRequest): Promise<ParkingVehicleDTO> {
  return apiFetch(`${BASE}/vehicles`, { method: 'POST', body: JSON.stringify(data) });
}

export function listParkingSessions(params?: ListParkingSessionsParams): Promise<Paginated<ParkingSessionDTO>> {
  return apiFetch(withQuery(`${BASE}/sessions`, params));
}

export function createParkingSession(data: CreateParkingSessionRequest): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions`, { method: 'POST', body: JSON.stringify(data) });
}

export function exitParkingSession(id: string, data: ExitParkingSessionRequest): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions/${id}/exit`, { method: 'PUT', body: JSON.stringify(data) });
}
