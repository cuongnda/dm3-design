export interface Zone {
  id: string;
  tenant_id: string;
  parent_id?: string;
  name: string;
  description?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  geo_lat?: number;
  geo_lng?: number;
  address?: string;
  floor?: string;
  building?: string;
  map_image_url?: string;
  map_width?: number;
  map_height?: number;
  map_image_width?: number;
  map_image_height?: number;
  map_metadata?: Record<string, unknown>;
  access_point_count: number;
  created_at: string;
  updated_at: string;
}

export interface ZoneFormData {
  name: string;
  description?: string;
  parent_id?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  geo_lat?: number;
  geo_lng?: number;
  address?: string;
  floor?: string;
  building?: string;
  map_image_url?: string;
  map_width?: number;
  map_height?: number;
  map_image_width?: number;
  map_image_height?: number;
  map_metadata?: Record<string, unknown>;
}

export interface ZoneMapResponse {
  zone: Zone;
  access_points: Array<{
    id: string;
    name: string;
    zone_id?: string;
    map_x?: number;
    map_y?: number;
    map_rotation?: number;
    map_label?: string;
    created_at: string;
    updated_at: string;
  }>;
}
