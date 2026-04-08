export interface AccessDevice {
  id: string;
  tenant_id: string;
  device_id?: string;
  name: string;
  type: string;
  status: string;   // offline | online | alarm
  state: string;    // locked | unlocked
  mode: string;     // normal | lockdown | free
  unlock_duration_ms: number;
  anti_passback: boolean;
  emergency_unlock: boolean;
  firmware_version?: string;
  ip_address?: string;
  last_event_at?: string;
  last_heartbeat_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AccessDeviceFormData {
  name: string;
  type: string;
  device_id?: string;
  unlock_duration_ms?: number;
  anti_passback?: boolean;
  emergency_unlock?: boolean;
}
