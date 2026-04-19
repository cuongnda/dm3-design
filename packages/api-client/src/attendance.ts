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

export function getAttendanceRecord(
  id: string,
): Promise<AttendanceRecordDTO> {
  return apiFetch(`${BASE}/records/${id}`);
}

export interface AdjustAttendanceRecordInput {
  clock_in?: string | null;
  clock_out?: string | null;
  status?: AttendanceStatus;
  shift_id?: string | null;
  leave_type?: string | null;
  notes?: string | null;
  adjustment_reason: string;
  recalc?: boolean;
}

export function adjustAttendanceRecord(
  id: string,
  body: AdjustAttendanceRecordInput,
): Promise<AttendanceRecordDTO> {
  return apiFetch(`${BASE}/records/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ─── Shifts ─────────────────────────────────────────────────────────────────

export interface ShiftDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  name: string;
  code?: string;
  start_time: string;
  end_time: string;
  grace_period_minutes: number;
  early_leave_threshold: number;
  break_start?: string;
  break_end?: string;
  break_deducted: boolean;
  overtime_threshold_minutes: number;
  max_overtime_hours: number;
  working_days: number[];
  color: string;
  is_default: boolean;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface ListShiftsParams {
  status?: "active" | "archived" | "all";
  site_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ShiftInput {
  name: string;
  code?: string | null;
  site_id?: string | null;
  start_time: string;
  end_time: string;
  grace_period_minutes?: number;
  early_leave_threshold?: number;
  break_start?: string | null;
  break_end?: string | null;
  break_deducted?: boolean;
  overtime_threshold_minutes?: number;
  max_overtime_hours?: number;
  working_days?: number[];
  color?: string;
  is_default?: boolean;
  status?: "active" | "archived";
}

export function listShifts(
  params?: ListShiftsParams,
): Promise<Paginated<ShiftDTO>> {
  return apiFetch(withQuery(`${BASE}/shifts`, params));
}

export function getShift(id: string): Promise<ShiftDTO> {
  return apiFetch(`${BASE}/shifts/${id}`);
}

export function createShift(body: ShiftInput): Promise<{ id: string }> {
  return apiFetch(`${BASE}/shifts`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateShift(
  id: string,
  body: Partial<ShiftInput>,
): Promise<{ status: string }> {
  return apiFetch(`${BASE}/shifts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function archiveShift(id: string): Promise<{ status: string }> {
  return apiFetch(`${BASE}/shifts/${id}`, { method: "DELETE" });
}

// ─── Leave ──────────────────────────────────────────────────────────────────

export interface LeavePolicyDTO {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  color: string;
  annual_quota_days: number;
  requires_approval: boolean;
  deducts_attendance: boolean;
  paid: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequestDTO {
  id: string;
  tenant_id: string;
  user_id: string;
  policy_id: string;
  start_date: string;
  end_date: string;
  days: number;
  half_day: boolean;
  reason?: string;
  attachment_ref?: string;
  status: LeaveStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  review_note?: string;
  cancelled_at?: string;
  created_at: string;
  updated_at: string;

  // Joined display fields.
  user_name?: string;
  user_email?: string;
  policy_code?: string;
  policy_name?: string;
  policy_color?: string;
}

export interface ListLeaveRequestsParams {
  status?: LeaveStatus;
  user_id?: string;
  policy_id?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateLeaveRequestInput {
  user_id: string;
  policy_id: string;
  start_date: string;
  end_date: string;
  days?: number;
  half_day?: boolean;
  reason?: string | null;
  attachment_ref?: string | null;
}

export function listLeavePolicies(activeOnly = true): Promise<LeavePolicyDTO[]> {
  return apiFetch(
    `${BASE}/leave/policies${activeOnly ? "" : "?active=false"}`,
  );
}

export function listLeaveRequests(
  params?: ListLeaveRequestsParams,
): Promise<Paginated<LeaveRequestDTO>> {
  return apiFetch(withQuery(`${BASE}/leave/requests`, params));
}

export function createLeaveRequest(
  body: CreateLeaveRequestInput,
): Promise<{ id: string; status: string }> {
  return apiFetch(`${BASE}/leave/requests`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function approveLeaveRequest(
  id: string,
  note?: string,
): Promise<{ status: string }> {
  return apiFetch(`${BASE}/leave/requests/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null }),
  });
}

export function rejectLeaveRequest(
  id: string,
  note?: string,
): Promise<{ status: string }> {
  return apiFetch(`${BASE}/leave/requests/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null }),
  });
}

export function cancelLeaveRequest(id: string): Promise<{ status: string }> {
  return apiFetch(`${BASE}/leave/requests/${id}/cancel`, { method: "POST" });
}

// ─── Settings ───────────────────────────────────────────────────────────────

export interface AttendanceSettingsDTO {
  tenant_id: string;
  default_grace_minutes: number;
  default_early_leave_threshold: number;
  overtime_threshold_minutes: number;
  overtime_requires_approval: boolean;
  auto_clockout_hours: number;
  workweek_start: number;
  timezone: string;
  carryover_enabled: boolean;
  carryover_max_days: number;
  created_at: string;
  updated_at: string;
}

export type AttendanceSettingsInput = Partial<
  Omit<AttendanceSettingsDTO, "tenant_id" | "created_at" | "updated_at">
>;

export function getAttendanceSettings(): Promise<AttendanceSettingsDTO> {
  return apiFetch(`${BASE}/settings`);
}

export function updateAttendanceSettings(
  body: AttendanceSettingsInput,
): Promise<AttendanceSettingsDTO> {
  return apiFetch(`${BASE}/settings`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

// ─── Overtime ─────────────────────────────────────────────────────────────────

export type OvertimeStatus = "pending" | "approved" | "rejected";

export interface OvertimeEntryDTO {
  record_id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  date: string;
  shift_name?: string;
  clock_in?: string;
  clock_out?: string;
  overtime_hours: number;
  overtime_approved: boolean;
  reviewed_by?: string;
  status: OvertimeStatus;
  updated_at: string;
}

export interface ListOvertimeParams {
  status?: OvertimeStatus | "all";
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export function listOvertime(
  params: ListOvertimeParams = {},
): Promise<Paginated<OvertimeEntryDTO>> {
  const q = new URLSearchParams();
  if (params.status) q.set("status", params.status);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.search) q.set("search", params.search);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch(`${BASE}/overtime${qs ? `?${qs}` : ""}`);
}

export function approveOvertime(
  id: string,
  note?: string,
): Promise<{ id: string; status: OvertimeStatus }> {
  return apiFetch(`${BASE}/overtime/${id}/approve`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

export function rejectOvertime(
  id: string,
  note?: string,
): Promise<{ id: string; status: OvertimeStatus }> {
  return apiFetch(`${BASE}/overtime/${id}/reject`, {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export interface ReportSummaryDTO {
  from: string;
  to: string;
  total_users: number;
  total_records: number;
  on_time_count: number;
  late_count: number;
  absent_count: number;
  on_leave_count: number;
  half_day_count: number;
  holiday_count: number;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  approved_overtime_hours: number;
  pending_overtime_count: number;
}

export interface ReportUserRowDTO {
  user_id: string;
  user_name: string;
  user_email: string;
  record_count: number;
  on_time_count: number;
  late_count: number;
  absent_count: number;
  on_leave_count: number;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  approved_overtime_hours: number;
  late_minutes: number;
}

export interface ReportResponseDTO {
  summary: ReportSummaryDTO;
  users: ReportUserRowDTO[];
}

export function getAttendanceReport(
  from: string,
  to: string,
): Promise<ReportResponseDTO> {
  const q = new URLSearchParams({ from, to });
  return apiFetch(`${BASE}/reports/summary?${q.toString()}`);
}
