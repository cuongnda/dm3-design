import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/devices';

export interface DeviceDTO {
  id: string;
  tenant_id?: string;
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

export interface CreateDeviceRequest {
  device_id: string;
  name: string;
  type: string;
  company_id?: string;
  site_id?: string;
  location?: string;
}

/** Matches backend sendCommandRequest: { type, data } */
export interface SendCommandRequest {
  type: string;
  data?: Record<string, unknown>;
}

// ── Pending Devices (Bootstrap Flow) ──────────────────────────────────────────

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
  hmac_verified?: boolean;
  signature_verified?: boolean;
  status: string;
  assigned_company_id?: string;
  created_at: string;
}

export interface ApprovePendingRequest {
  company_id: string;
  site_id?: string;
  name: string;
  location?: string;
}

// ── Provisioning (QR Flow) ────────────────────────────────────────────────────

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

/** Returned by RegenerateQR — flat provisioning object (no device wrapper) */
export interface RegenerateQRResponse {
  qr_token: string;
  qr_data: string;
  expires_at: string;
  ttl_minutes: number;
}

// ── Device API functions ───────────────────────────────────────────────────────

export function listDevices(): Promise<DeviceDTO[]> {
  return apiFetch<DeviceDTO[]>(BASE);
}

export function getDevice(id: string): Promise<DeviceDTO> {
  return apiFetch<DeviceDTO>(`${BASE}/${id}`);
}

export function createDevice(data: CreateDeviceRequest): Promise<DeviceDTO> {
  return apiFetch<DeviceDTO>(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function sendCommand(id: string, cmd: SendCommandRequest): Promise<{ message: string; message_id: string }> {
  return apiFetch(`${BASE}/${id}/command`, { method: 'POST', body: JSON.stringify(cmd) });
}

export function getDeviceEvents(id: string, page = 1, limit = 20): Promise<Paginated<Record<string, unknown>>> {
  return apiFetch(`${BASE}/${id}/events?page=${page}&limit=${limit}`);
}

// ── Pending Device functions ───────────────────────────────────────────────────

export function listPendingDevices(): Promise<PendingDevice[]> {
  return apiFetch<PendingDevice[]>(`${BASE}/pending`);
}

export function approvePendingDevice(id: string, data: ApprovePendingRequest): Promise<{ status: string; device_id: string; rid: string }> {
  return apiFetch(`${BASE}/pending/${id}/approve`, { method: 'POST', body: JSON.stringify(data) });
}

export function rejectPendingDevice(id: string): Promise<{ status: string; rid: string }> {
  return apiFetch(`${BASE}/pending/${id}/reject`, { method: 'POST' });
}

// ── Provisioning functions ─────────────────────────────────────────────────────

export function provisionDevice(data: ProvisionRequest): Promise<ProvisionResponse> {
  return apiFetch<ProvisionResponse>(`${BASE}/provision`, { method: 'POST', body: JSON.stringify(data) });
}

export function regenerateQR(deviceDbId: string): Promise<RegenerateQRResponse> {
  return apiFetch<RegenerateQRResponse>(`${BASE}/provision/${deviceDbId}/qr`);
}
