export interface AccessGroup {
  id: string;
  tenant_id: string;
  access_time_id?: string;
  name: string;
  description?: string;
  is_default: boolean;
  type: number;
  access_point_count: number;
  user_count: number;
  access_time?: AccessTime;
  created_at: string;
  updated_at: string;
}

export interface AccessGroupFormData {
  name: string;
  description?: string;
  access_time_id?: string;
  is_default?: boolean;
}

export interface AccessTime {
  id: string;
  name: string;
  description?: string;
}

export interface AccessGroupAccessPoint {
  id: string;
  access_group_id: string;
  access_point_id: string;
  created_at: string;
  access_point?: {
    id: string;
    name: string;
    description?: string;
  };
}
