export interface AccessPoint {
  id: string;
  tenant_id: string;
  zone_id?: string;
  access_time_id?: string;
  name: string;
  description?: string;
  map_x?: number;
  map_y?: number;
  map_rotation?: number;
  map_label?: string;
  access_device_count: number;
  device_status?: string;  // online | offline
  door_state?: string;     // closed | open | held_open | forced | alarm
  zone_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AccessPointFormData {
  name: string;
  description?: string;
  zone_id?: string;
  access_time_id?: string;
  map_x?: number;
  map_y?: number;
  map_rotation?: number;
  map_label?: string;
}

export interface AccessPointDevice {
  id: string;
  access_point_id: string;
  access_device_id: string;
  role: string; // reader_in | reader_out | controller | camera
  device?: {
    id: string;
    name: string;
    type: string;
    status: string;
    state: string;
  };
  created_at: string;
}

export interface Zone {
  id: string;
  name: string;
  timezone?: string;
  map_image_url?: string;
}

export interface AccessTime {
  id: string;
  name: string;
  timezone: string;
}
