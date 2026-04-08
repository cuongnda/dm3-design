export interface Zone {
  id: string;
  tenant_id: string;
  parent_id?: string;
  name: string;
  description?: string;
  access_point_count: number;
  created_at: string;
  updated_at: string;
}

export interface ZoneFormData {
  name: string;
  description?: string;
  parent_id?: string;
}
