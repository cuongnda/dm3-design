import { apiFetch } from './client';

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

export interface SendCommandRequest {
  command: string;
  params?: Record<string, unknown>;
}

export function listDevices(): Promise<DeviceDTO[]> {
  return apiFetch<DeviceDTO[]>(BASE);
}

export function getDevice(id: string): Promise<DeviceDTO> {
  return apiFetch<DeviceDTO>(`${BASE}/${id}`);
}

export function createDevice(data: CreateDeviceRequest): Promise<DeviceDTO> {
  return apiFetch<DeviceDTO>(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function sendCommand(id: string, cmd: SendCommandRequest): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}/command`, { method: 'POST', body: JSON.stringify(cmd) });
}
