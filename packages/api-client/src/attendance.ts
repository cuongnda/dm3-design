import { apiFetch } from "./client";
import type { Paginated } from "./types/api";

const BASE = "/api/v1/attendance";

export type AttendanceStatus =
  | "pending"
  | "on_time"
  | "late"
  | "absent"
  | "on_leave"
  | "half_day"
  | "holiday";

export type AttendanceMethod =
  | "face"
  | "card"
  | "pin"
  | "mobile"
  | "unknown";

export interface AttendanceRecordDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  user_id: string;
  date: string;
  shift_id?: string;

  clock_in?: string;
  clock_in_device_id?: string;
  clock_in_method?: string;
  clock_in_photo_ref?: string;

  clock_out?: string;
  clock_out_device_id?: string;
  clock_out_method?: string;
  clock_out_photo_ref?: string;

  status: AttendanceStatus;
  total_hours?: number;
  regular_hours?: number;
  overtime_hours?: number;
  late_minutes: number;
  early_leave_minutes: number;
  break_minutes?: number;

  overtime_approved: boolean;
  overtime_approved_by?: string;
  manual_adjustment: boolean;
  adjusted_by?: string;
  adjustment_reason?: string;

  leave_type?: string;
  leave_reference_id?: string;
  notes?: string;

  created_at: string;
  updated_at: string;

  // Denormalised display fields populated by the list endpoint.
  user_name?: string;
  user_email?: string;
  shift_name?: string;
  shift_start?: string;
  shift_end?: string;
}

export interface AttendanceDailySummaryDTO {
  total: number;
  on_time: number;
  late: number;
  absent: number;
  on_leave: number;
  half_day: number;
  holiday: number;
  pending: number;
  clocked_in: number;
}

export interface ListAttendanceRecordsParams {
  date?: string; // YYYY-MM-DD; defaults server-side to today (UTC)
  site_id?: string;
  status?: AttendanceStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export interface AttendanceDailySummaryParams {
  date?: string;
  site_id?: string;
}

function withQuery<T extends object>(path: string, params?: T) {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  });
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export function listAttendanceRecords(
  params?: ListAttendanceRecordsParams,
): Promise<Paginated<AttendanceRecordDTO>> {
  return apiFetch(withQuery(`${BASE}/records`, params));
}

export function getAttendanceDailySummary(
  params?: AttendanceDailySummaryParams,
): Promise<AttendanceDailySummaryDTO> {
  return apiFetch(withQuery(`${BASE}/records/summary`, params));
}
