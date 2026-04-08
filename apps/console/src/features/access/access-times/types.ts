export interface AccessTimeSlot {
  id: string;
  access_time_id: string;
  day_of_week: number; // 0=Sun...6=Sat
  start_time: string;  // "08:00:00"
  end_time: string;    // "17:00:00"
  slot_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface AccessTime {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  timezone: string;
  is_active: boolean;
  slot_count?: number;
  slots?: AccessTimeSlot[];
  created_at: string;
  updated_at: string;
}

export interface AccessTimeFormData {
  name: string;
  description?: string;
  timezone: string;
  is_active: boolean;
  slots: SlotInput[];
}

export interface SlotInput {
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_name: string;
  is_active: boolean;
}
