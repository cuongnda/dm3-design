export interface AccessPoint {
  id: string;
  tenant_id: string;
  zone_id?: string;
  access_time_id?: string;
  name: string;
  description?: string;
  door_count: number;
  created_at: string;
  updated_at: string;
}

export interface AccessPointFormData {
  name: string;
  description?: string;
  zone_id?: string;
  access_time_id?: string;
}

export interface AccessPointDoor {
  id: string;
  access_point_id: string;
  door_id: string;
  role: string; // reader_in | reader_out | controller | camera
  door?: {
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
}

export interface AccessTime {
  id: string;
  name: string;
  timezone: string;
}
