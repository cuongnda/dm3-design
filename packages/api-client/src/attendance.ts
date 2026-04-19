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
  date?: string; // YYYY-MM-DD; ignored when from/to supplied; default server-side is today
  from?: string; // YYYY-MM-DD inclusive lower bound
  to?: string;   // YYYY-MM-DD inclusive upper bound
  user_id?: string;
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

export interface BulkAssignShiftInput {
  shift_id: string;
  user_ids: string[];
  effective_from: string; // YYYY-MM-DD
  effective_until?: string | null;
  replace_active?: boolean;
}

export function bulkAssignShift(body: BulkAssignShiftInput): Promise<{
  shift_id: string;
  assigned_count: number;
  effective_from: string;
  effective_until?: string | null;
}> {
  return apiFetch(`${BASE}/shifts/assign`, {
    method: "POST",
    body: JSON.stringify(body),
  });
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

export interface LeavePolicyInput {
  code: string;
  name: string;
  color?: string;
  annual_quota_days?: number;
  requires_approval?: boolean;
  deducts_attendance?: boolean;
  paid?: boolean;
  is_active?: boolean;
}

export function createLeavePolicy(body: LeavePolicyInput): Promise<{ id: string }> {
  return apiFetch(`${BASE}/leave/policies`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateLeavePolicy(
  id: string,
  body: Partial<LeavePolicyInput>,
): Promise<{ status: string }> {
  return apiFetch(`${BASE}/leave/policies/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteLeavePolicy(id: string): Promise<void> {
  return apiFetch(`${BASE}/leave/policies/${id}`, { method: "DELETE" });
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

// ─── Leave Balances ─────────────────────────────────────────────────────────

export interface LeaveBalanceDTO {
  id: string;
  tenant_id: string;
  user_id: string;
  policy_id: string;
  year: number;
  entitled_days: number;
  used_days: number;
  pending_days: number;
  carried_over: number;
  remaining_days: number;
  updated_at: string;
  policy_code?: string;
  policy_name?: string;
  policy_color?: string;
}

export interface ListLeaveBalancesParams {
  user_id?: string;
  year?: number;
}

export interface AdjustLeaveBalanceInput {
  user_id: string;
  policy_id: string;
  year?: number;
  entitled_days?: number;
  carried_over?: number;
}

export function listLeaveBalances(
  params?: ListLeaveBalancesParams,
): Promise<{ items: LeaveBalanceDTO[] }> {
  return apiFetch(withQuery(`${BASE}/leave/balances`, params));
}

export function adjustLeaveBalance(
  body: AdjustLeaveBalanceInput,
): Promise<{ status: string }> {
  return apiFetch(`${BASE}/leave/balances/adjust`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ─── Holidays ───────────────────────────────────────────────────────────────

export interface HolidayDTO {
  id: string;
  tenant_id: string;
  date: string; // YYYY-MM-DD
  name: string;
  description?: string | null;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
}

export interface HolidayInput {
  date: string;
  name: string;
  description?: string | null;
  is_paid?: boolean;
}

export function listHolidays(year?: number): Promise<{ items: HolidayDTO[] }> {
  const qs = year ? `?year=${year}` : "";
  return apiFetch(`${BASE}/holidays${qs}`);
}

export function createHoliday(body: HolidayInput): Promise<{ id: string }> {
  return apiFetch(`${BASE}/holidays`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateHoliday(
  id: string,
  body: Partial<HolidayInput>,
): Promise<{ status: string }> {
  return apiFetch(`${BASE}/holidays/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteHoliday(id: string): Promise<void> {
  return apiFetch(`${BASE}/holidays/${id}`, { method: "DELETE" });
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

export interface OvertimeRequestInput {
  date: string; // YYYY-MM-DD
  hours: number;
  reason: string;
  user_id?: string; // manager-on-behalf; defaults to the caller
}

export function requestOvertime(input: OvertimeRequestInput): Promise<{
  id: string;
  user_id: string;
  date: string;
  overtime_hours: number;
  status: OvertimeStatus;
}> {
  return apiFetch(`${BASE}/overtime/request`, {
    method: "POST",
    body: JSON.stringify(input),
  });
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

export type LaborLawAdvisoryCode =
  | "weekly_cap"
  | "monthly_ot"
  | "annual_ot";

export type LaborLawAdvisorySeverity = "warning" | "violation";

export interface LaborLawAdvisoryDTO {
  code: LaborLawAdvisoryCode;
  severity: LaborLawAdvisorySeverity;
  message: string;
  threshold: number;
  value: number;
}

export interface ReportResponseDTO {
  summary: ReportSummaryDTO;
  users: ReportUserRowDTO[];
  // BR-ATT-007 labor-law advisories keyed by user_id. Only users with at
  // least one advisory appear here; treat a missing key as "all clear".
  advisories?: Record<string, LaborLawAdvisoryDTO[]>;
}

export function getAttendanceReport(
  from: string,
  to: string,
): Promise<ReportResponseDTO> {
  const q = new URLSearchParams({ from, to });
  return apiFetch(`${BASE}/reports/summary?${q.toString()}`);
}

// ─── Attendance devices registry ─────────────────────────────────────────────

export type AttendanceDeviceFunction = "clock_in" | "clock_out" | "both";

export interface AttendanceDeviceDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  device_id: string;
  function: AttendanceDeviceFunction;
  location_name?: string;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  device_name?: string;
  device_kind?: string;
}

export interface RegisterAttendanceDeviceInput {
  device_id: string;
  site_id?: string;
  function: AttendanceDeviceFunction;
  location_name?: string;
  is_primary?: boolean;
}

export function listAttendanceDevices(): Promise<AttendanceDeviceDTO[]> {
  return apiFetch(`${BASE}/devices`);
}

export function registerAttendanceDevice(
  input: RegisterAttendanceDeviceInput,
): Promise<{ id: string }> {
  return apiFetch(`${BASE}/devices`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deregisterAttendanceDevice(id: string): Promise<void> {
  return apiFetch(`${BASE}/devices/${id}`, { method: "DELETE" });
}

// ─── Leave calendar ──────────────────────────────────────────────────────────

export type LeaveCalendarEntryType = "leave" | "holiday";
export type LeaveCalendarStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "holiday";

export interface LeaveCalendarEntryDTO {
  type: LeaveCalendarEntryType;
  start_date: string;
  end_date: string;
  user_id?: string;
  user_name?: string;
  policy_id?: string;
  policy_code?: string;
  policy_name?: string;
  color?: string;
  status?: LeaveCalendarStatus;
  title?: string;
  days?: number;
  half_day?: boolean;
}

export interface LeaveCalendarParams {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  user_id?: string;
  status?: "approved" | "pending" | "all";
}

export function getLeaveCalendar(
  params: LeaveCalendarParams,
): Promise<LeaveCalendarEntryDTO[]> {
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  if (params.user_id) qs.set("user_id", params.user_id);
  if (params.status) qs.set("status", params.status);
  return apiFetch(`${BASE}/leave/calendar?${qs.toString()}`);
}

// ─── Monthly summary rollup ──────────────────────────────────────────────────

export interface AttendanceSummaryDTO {
  id: string;
  tenant_id: string;
  user_id: string;
  year: number;
  month: number; // 1..12
  workdays: number;
  on_time_count: number;
  late_count: number;
  absent_count: number;
  on_leave_count: number;
  half_day_count: number;
  holiday_count: number;
  pending_count: number;
  total_hours: number;
  regular_hours: number;
  overtime_hours: number;
  approved_overtime_hours: number;
  late_minutes: number;
  early_leave_minutes: number;
  generated_at: string;
  user_name?: string;
  user_email?: string;
}

export interface ListMonthlySummaryParams {
  year: number;
  month: number;
  user_id?: string;
}

export function listMonthlyAttendanceSummary(
  params: ListMonthlySummaryParams,
): Promise<AttendanceSummaryDTO[]> {
  const qs = new URLSearchParams();
  qs.set("year", String(params.year));
  qs.set("month", String(params.month));
  if (params.user_id) qs.set("user_id", params.user_id);
  return apiFetch(`${BASE}/summary/monthly?${qs.toString()}`);
}

export function rebuildMonthlyAttendanceSummary(
  year: number,
  month: number,
): Promise<{ year: number; month: number; ok: boolean }> {
  const qs = new URLSearchParams();
  qs.set("year", String(year));
  qs.set("month", String(month));
  return apiFetch(`${BASE}/summary/monthly/rebuild?${qs.toString()}`, {
    method: "POST",
  });
}

// ─── Monthly report export ───────────────────────────────────────────────────

export type MonthlyReportFormat = "csv" | "xlsx";

export interface ExportMonthlyReportResult {
  year: number;
  month: number;
  format: MonthlyReportFormat;
  rows: number;
  key: string;
  size: number;
  content_type: string;
  download_url: string;
}

export function exportMonthlyAttendanceReport(
  year: number,
  month: number,
  format: MonthlyReportFormat = "csv",
): Promise<ExportMonthlyReportResult> {
  const qs = new URLSearchParams();
  qs.set("year", String(year));
  qs.set("month", String(month));
  qs.set("format", format);
  return apiFetch(`${BASE}/reports/monthly/export?${qs.toString()}`, {
    method: "POST",
  });
}

export function monthlyAttendanceReportDownloadURL(
  year: number,
  month: number,
  format: MonthlyReportFormat = "csv",
): string {
  const qs = new URLSearchParams();
  qs.set("year", String(year));
  qs.set("month", String(month));
  qs.set("format", format);
  return `${BASE}/reports/monthly/download?${qs.toString()}`;
}

// ─── HR leave sync webhook ─────────────────────────────────────────────────

export type LeaveSyncStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface LeaveSyncRequestInput {
  external_id: string;
  user_id: string;
  policy_code: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;
  days?: number;
  half_day?: boolean;
  reason?: string | null;
  status?: LeaveSyncStatus;
}

export interface LeaveSyncRowResult {
  external_id: string;
  id?: string;
  status?: "created" | "updated" | "unchanged" | "failed";
  error?: string;
}

export interface LeaveSyncResponse {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  results: LeaveSyncRowResult[];
}

export function syncLeaveRequests(
  requests: LeaveSyncRequestInput[],
): Promise<LeaveSyncResponse> {
  return apiFetch(`${BASE}/leave/sync`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
}

// ─── Self-service (/me) ─────────────────────────────────────────────────────

export interface MeAttendanceSummary {
  from: string;
  to: string;
  on_time: number;
  late: number;
  absent: number;
  on_leave: number;
  half_day: number;
  holiday: number;
  pending: number;
  total_hours: number;
  regular_hours: number;
  ot_hours: number;
  late_minutes: number;
}

export interface MeAttendanceToday {
  date: string;
  status: AttendanceStatus;
  clock_in?: string;
  clock_out?: string;
  shift_name?: string;
  shift_start?: string;
  shift_end?: string;
  total_hours?: number;
}

export interface MeAttendanceResponse {
  user_id: string;
  today?: MeAttendanceToday;
  summary: MeAttendanceSummary;
  records: AttendanceRecordDTO[];
}

export interface MeAttendanceParams {
  from?: string;
  to?: string;
}

export function getMeAttendance(
  params?: MeAttendanceParams,
): Promise<MeAttendanceResponse> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch(`${BASE}/me/attendance${suffix}`);
}
