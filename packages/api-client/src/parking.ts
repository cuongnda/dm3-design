import { apiFetch } from "./client";
import type { Paginated } from "./types/api";

const BASE = "/api/v1/parking";

export interface ParkingLotDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  name: string;
  code: string;
  description?: string;
  status: string;
  zone_count?: number;
  active_session_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ParkingZoneDTO {
  id: string;
  tenant_id: string;
  lot_id: string;
  site_id?: string;
  access_zone_id?: string;
  name: string;
  code: string;
  type: string;
  level?: string;
  total_spaces: number;
  vehicle_types?: string[];
  status: string;
  active_session_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ParkingVehicleDTO {
  id: string;
  tenant_id: string;
  owner_id?: string;
  visitor_id?: string;
  plate_number: string;
  normalized_plate: string;
  plate_image_ref?: string;
  rfid_tag?: string;
  nfc_card_id?: string;
  type: string;
  category: string;
  brand?: string;
  color?: string;
  registration_status: string;
  monthly_pass_id?: string;
  active_pass_id?: string;
  created_at: string;
  updated_at: string;
  // Read-only display fields resolved via soft FK lookup on the server.
  // owner_type is "user", "visitor", or undefined/empty for anonymous vehicles.
  owner_name?: string;
  owner_type?: "user" | "visitor" | "";
}

export interface ParkingPassDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  lot_id?: string;
  zone_id: string;
  vehicle_id: string;
  user_id?: string;
  pass_type: string;
  valid_from: string;
  valid_until: string;
  fee_amount: number;
  status: string;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
}

export interface ParkingSessionDTO {
  id: string;
  tenant_id: string;
  lot_id: string;
  zone_id: string;
  vehicle_id?: string;
  plate_number: string;
  normalized_plate_number: string;
  vehicle_type: string;
  vehicle_category?: string;
  entry_time: string;
  exit_time?: string;
  entry_device_id?: string;
  exit_device_id?: string;
  entry_plate_image?: string;
  exit_plate_image?: string;
  status: string;
  fee_amount?: number;
  fee_currency: string;
  fee_rule_id?: string;
  payment_status?: string;
  payment_method?: string;
  payment_ref?: string;
  payment_time?: string;
  monthly_pass_id?: string;
  matched_by: string;
  recognition_confidence?: number;
  decision_code?: string;
  decision_reason?: string;
  duration_minutes?: number;
  created_at: string;
  updated_at: string;
}

export interface ListParkingLotsParams {
  page?: number;
  limit?: number;
  site_id?: string;
  status?: string;
}

export interface ListParkingZonesParams {
  page?: number;
  limit?: number;
  lot_id?: string;
  site_id?: string;
  status?: string;
  type?: string;
  vehicle_type?: string;
}

export interface ListParkingVehiclesParams {
  page?: number;
  limit?: number;
  plate_number?: string;
  owner_id?: string;
  type?: string;
  registration_status?: string;
}

export interface ListParkingSessionsParams {
  page?: number;
  limit?: number;
  lot_id?: string;
  zone_id?: string;
  status?: string;
  plate_number?: string;
  vehicle_type?: string;
  from?: string;
  to?: string;
}

export interface CreateParkingVehicleRequest {
  owner_id?: string;
  visitor_id?: string;
  plate_number: string;
  rfid_tag?: string;
  nfc_card_id?: string;
  type: string;
  category?: string;
  brand?: string;
  color?: string;
  registration_status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateParkingSessionRequest {
  lot_id: string;
  zone_id: string;
  plate_number?: string;
  vehicle_type: string;
  rfid_tag?: string;
  nfc_card_id?: string;
  entry_device_id?: string;
  plate_image_ref?: string;
  matched_by?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface CreateParkingPassRequest {
  site_id?: string;
  lot_id?: string;
  zone_id: string;
  vehicle_id: string;
  user_id?: string;
  pass_type?: string;
  valid_from: string;
  valid_until: string;
  fee_amount: number;
  status?: string;
  auto_renew?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ParkingRecognitionRequest {
  lot_id: string;
  zone_id: string;
  direction: "entry" | "exit";
  plate_number?: string;
  vehicle_type: string;
  rfid_tag?: string;
  nfc_card_id?: string;
  device_id?: string;
  image_ref?: string;
  confidence?: number;
  operator_note?: string;
}

export interface ParkingPaymentRequest {
  method: string;
  amount: number;
  reference?: string;
}

export interface ExitParkingSessionRequest {
  exit_device_id?: string;
  plate_number?: string;
  plate_image_ref?: string;
  rfid_tag?: string;
  nfc_card_id?: string;
}

export interface ListParkingPassesParams {
  page?: number;
  limit?: number;
  zone_id?: string;
  vehicle_id?: string;
  status?: string;
}

export interface ListParkingFeeRulesParams {
  page?: number;
  limit?: number;
  lot_id?: string;
  zone_id?: string;
  vehicle_type?: string;
}

export interface ParkingFeeRuleDTO {
  id: string;
  tenant_id: string;
  site_id?: string;
  lot_id?: string;
  zone_id?: string;
  name: string;
  vehicle_type: string;
  rate_type: string;
  rates: Record<string, unknown>;
  free_minutes: number;
  max_daily?: number;
  applies_to: string;
  priority: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateParkingLotRequest {
  site_id?: string;
  name: string;
  code: string;
  description?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateParkingZoneRequest {
  lot_id: string;
  site_id?: string;
  name: string;
  code: string;
  type?: string;
  level?: string;
  total_spaces: number;
  vehicle_types?: string[];
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateParkingFeeRuleRequest {
  site_id?: string;
  lot_id?: string;
  zone_id?: string;
  name: string;
  vehicle_type: string;
  rate_type: string;
  rates: Record<string, unknown>;
  free_minutes?: number;
  max_daily?: number;
  applies_to?: string;
  priority?: number;
  enabled?: boolean;
}

export interface ParkingSettingsDTO {
  id: string;
  tenant_id: string;
  auto_open_barrier_on_pass: boolean;
  confidence_threshold: number;
  require_payment_before_exit: boolean;
  free_minutes_global: number;
  max_session_hours: number;
  allow_unregistered_entry: boolean;
  plate_recognition_enabled: boolean;
  default_fee_currency: string;
  notify_on_disputed: boolean;
  capacity_alert_threshold: number;
  enforce_access_rules: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpdateParkingSettingsRequest {
  auto_open_barrier_on_pass?: boolean;
  confidence_threshold?: number;
  require_payment_before_exit?: boolean;
  free_minutes_global?: number;
  max_session_hours?: number;
  allow_unregistered_entry?: boolean;
  plate_recognition_enabled?: boolean;
  default_fee_currency?: string;
  notify_on_disputed?: boolean;
  capacity_alert_threshold?: number;
  enforce_access_rules?: boolean;
}

export interface ZoneOccupancyDTO {
  zone_id: string;
  zone_name: string;
  lot_id: string;
  total_spaces: number;
  occupied: number;
  available: number;
  percent: number;
}

export interface ParkingDashboardDTO {
  active_sessions: number;
  total_spaces: number;
  occupied_spaces: number;
  available_spaces: number;
  occupancy_percent: number;
  entered_today: number;
  exited_today: number;
  revenue_today: number;
  pending_payments: number;
  disputed_sessions: number;
  zone_occupancy: ZoneOccupancyDTO[];
}

export interface VehicleTypeBreakdownDTO {
  vehicle_type: string;
  count: number;
  revenue: number;
}

export interface PaymentBreakdownDTO {
  status: string;
  count: number;
}

export interface DailyTrendDTO {
  date: string;
  sessions: number;
  revenue: number;
}

export interface PeakHourDTO {
  hour: number;
  sessions: number;
}

export interface TopPlateDTO {
  plate_number: string;
  vehicle_type: string;
  visit_count: number;
}

export interface ParkingAnalyticsDTO {
  period: string;
  total_sessions: number;
  total_revenue: number;
  avg_duration_minutes: number;
  avg_occupancy_percent: number;
  by_vehicle_type: VehicleTypeBreakdownDTO[];
  by_payment_status: PaymentBreakdownDTO[];
  daily_trend: DailyTrendDTO[];
  peak_hours: PeakHourDTO[];
  top_plates: TopPlateDTO[];
}

function withQuery<T extends object>(path: string, params?: T) {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  });
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export function listParkingLots(
  params?: ListParkingLotsParams,
): Promise<Paginated<ParkingLotDTO>> {
  return apiFetch(withQuery(`${BASE}/lots`, params));
}

export function listParkingZones(
  params?: ListParkingZonesParams,
): Promise<Paginated<ParkingZoneDTO>> {
  return apiFetch(withQuery(`${BASE}/zones`, params));
}

export function listParkingVehicles(
  params?: ListParkingVehiclesParams,
): Promise<Paginated<ParkingVehicleDTO>> {
  return apiFetch(withQuery(`${BASE}/vehicles`, params));
}

export function getParkingVehicle(id: string): Promise<ParkingVehicleDTO> {
  return apiFetch(`${BASE}/vehicles/${id}`);
}

export function createParkingVehicle(
  data: CreateParkingVehicleRequest,
): Promise<ParkingVehicleDTO> {
  return apiFetch(`${BASE}/vehicles`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listParkingSessions(
  params?: ListParkingSessionsParams,
): Promise<Paginated<ParkingSessionDTO>> {
  return apiFetch(withQuery(`${BASE}/sessions`, params));
}

export function createParkingSession(
  data: CreateParkingSessionRequest,
): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function recognizeParkingPlate(
  data: ParkingRecognitionRequest,
): Promise<ParkingSessionDTO | Record<string, unknown>> {
  return apiFetch(`${BASE}/sessions/recognitions`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function exitParkingSession(
  id: string,
  data: ExitParkingSessionRequest,
): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions/${id}/exit`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function processParkingPayment(
  id: string,
  data: ParkingPaymentRequest,
): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions/${id}/payment`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function listParkingPasses(
  params?: ListParkingPassesParams,
): Promise<Paginated<ParkingPassDTO>> {
  return apiFetch(withQuery(`${BASE}/passes`, params));
}

export function createParkingPass(
  data: CreateParkingPassRequest,
): Promise<ParkingPassDTO> {
  return apiFetch(`${BASE}/passes`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ─── Get by ID ──────────────────────────────────────────────────────────────

export function getParkingLot(id: string): Promise<ParkingLotDTO> {
  return apiFetch(`${BASE}/lots/${id}`);
}

export function getParkingZone(id: string): Promise<ParkingZoneDTO> {
  return apiFetch(`${BASE}/zones/${id}`);
}

export function getParkingSession(id: string): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions/${id}`);
}

// ─── Lots CRUD ──────────────────────────────────────────────────────────────

export function createParkingLot(
  data: CreateParkingLotRequest,
): Promise<ParkingLotDTO> {
  return apiFetch(`${BASE}/lots`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateParkingLot(
  id: string,
  data: Partial<CreateParkingLotRequest>,
): Promise<ParkingLotDTO> {
  return apiFetch(`${BASE}/lots/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteParkingLot(id: string): Promise<void> {
  return apiFetch(`${BASE}/lots/${id}`, { method: "DELETE" });
}

// ─── Zones CRUD ─────────────────────────────────────────────────────────────

export function createParkingZone(
  data: CreateParkingZoneRequest,
): Promise<ParkingZoneDTO> {
  return apiFetch(`${BASE}/zones`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateParkingZone(
  id: string,
  data: Partial<CreateParkingZoneRequest>,
): Promise<ParkingZoneDTO> {
  return apiFetch(`${BASE}/zones/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteParkingZone(id: string): Promise<void> {
  return apiFetch(`${BASE}/zones/${id}`, { method: "DELETE" });
}

// ─── Vehicles CRUD ──────────────────────────────────────────────────────────

export function updateParkingVehicle(
  id: string,
  data: Partial<CreateParkingVehicleRequest>,
): Promise<ParkingVehicleDTO> {
  return apiFetch(`${BASE}/vehicles/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteParkingVehicle(id: string): Promise<void> {
  return apiFetch(`${BASE}/vehicles/${id}`, { method: "DELETE" });
}

// ─── Fee Rules CRUD ─────────────────────────────────────────────────────────

export function listParkingFeeRules(
  params?: ListParkingFeeRulesParams,
): Promise<Paginated<ParkingFeeRuleDTO>> {
  return apiFetch(withQuery(`${BASE}/fee-rules`, params));
}

export function createParkingFeeRule(
  data: CreateParkingFeeRuleRequest,
): Promise<ParkingFeeRuleDTO> {
  return apiFetch(`${BASE}/fee-rules`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateParkingFeeRule(
  id: string,
  data: Partial<CreateParkingFeeRuleRequest>,
): Promise<ParkingFeeRuleDTO> {
  return apiFetch(`${BASE}/fee-rules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteParkingFeeRule(id: string): Promise<void> {
  return apiFetch(`${BASE}/fee-rules/${id}`, { method: "DELETE" });
}

// ─── Passes CRUD ────────────────────────────────────────────────────────────

export function updateParkingPass(
  id: string,
  data: Partial<CreateParkingPassRequest>,
): Promise<ParkingPassDTO> {
  return apiFetch(`${BASE}/passes/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteParkingPass(id: string): Promise<void> {
  return apiFetch(`${BASE}/passes/${id}`, { method: "DELETE" });
}

// ─── Sessions Extra ─────────────────────────────────────────────────────────

export function voidParkingSession(id: string): Promise<ParkingSessionDTO> {
  return apiFetch(`${BASE}/sessions/${id}/void`, { method: "PUT" });
}

// ─── Dashboard & Analytics ──────────────────────────────────────────────────

export function getParkingDashboard(): Promise<ParkingDashboardDTO> {
  return apiFetch(`${BASE}/dashboard`);
}

export function getParkingAnalytics(
  period?: "7d" | "30d" | "90d",
): Promise<ParkingAnalyticsDTO> {
  return apiFetch(
    withQuery(`${BASE}/analytics`, period ? { period } : undefined),
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────

export function getParkingSettings(): Promise<ParkingSettingsDTO> {
  return apiFetch(`${BASE}/settings`);
}

export function updateParkingSettings(
  data: UpdateParkingSettingsRequest,
): Promise<ParkingSettingsDTO> {
  return apiFetch(`${BASE}/settings`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
