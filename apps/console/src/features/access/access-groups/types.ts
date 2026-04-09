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

export interface AccessTimeSlot {
  id: string;
  access_time_id: string;
  day_of_week: number; // 0=Sunday ... 6=Saturday
  start_time: string;  // "08:00:00"
  end_time: string;    // "17:00:00"
  slot_name?: string;
  is_active: boolean;
}

export interface AccessTime {
  id: string;
  name: string;
  description?: string;
  slots?: AccessTimeSlot[];
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
