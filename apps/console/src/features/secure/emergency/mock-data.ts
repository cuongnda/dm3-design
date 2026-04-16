/* ── Emergency types ────────────────────────────────────────────── */

export type EmergencyType = 'fire' | 'lockdown' | 'medical' | 'intruder';
export type IncidentStatus = 'active' | 'countdown' | 'resolved' | 'cancelled';
export type PlanScope = 'zone' | 'floor' | 'building_wide';

/* ── Config per type ───────────────────────────────────────────── */

export interface TypeConfig {
  label: string;
  labelVi: string;
  /** Lucide icon name — rendered in the component, not stored here */
  color: string;
  bgToken: string;    // tailwind bg token at /10
  textToken: string;  // tailwind text token
}

export const emergencyTypeConfig: Record<EmergencyType, TypeConfig> = {
  fire:     { label: 'Fire',     labelVi: 'Hỏa hoạn',      color: '#EF4444', bgToken: 'bg-error/10',   textToken: 'text-error' },
  lockdown: { label: 'Lockdown', labelVi: 'Phong tỏa',     color: '#F59E0B', bgToken: 'bg-warning/10', textToken: 'text-warning' },
  medical:  { label: 'Medical',  labelVi: 'Y tế',           color: '#22C55E', bgToken: 'bg-success/10', textToken: 'text-success' },
  intruder: { label: 'Intruder', labelVi: 'Kẻ xâm nhập',   color: '#8B5CF6', bgToken: 'bg-[#8B5CF6]/10', textToken: 'text-[#8B5CF6]' },
};

/* ── Emergency plan (configurable rule) ────────────────────────── */

export interface EmergencyAction {
  order: number;
  type: string;       // door_control | camera_control | alarm_control | notification | intercom | lift_control
  targetType: string; // door | zone | camera | intercom | notification | lift
  action: string;     // unlock | lock | record | announce | alert | recall | arm | disarm
  description: string;
}

export interface EmergencyPlan {
  id: string;
  name: string;
  type: EmergencyType;
  scope: PlanScope;
  severity: 'high' | 'critical';
  confirmationRequired: boolean;
  countdownSeconds: number;
  enabled: boolean;
  actions: EmergencyAction[];
  allClearActions: EmergencyAction[];
  lastActivatedAt: string | null;
  lastDrillAt: string | null;
  createdAt: string;
}

export const mockPlans: EmergencyPlan[] = [
  {
    id: 'plan-1',
    name: 'Sơ tán hỏa hoạn — Toàn tòa nhà',
    type: 'fire',
    scope: 'building_wide',
    severity: 'critical',
    confirmationRequired: true,
    countdownSeconds: 10,
    enabled: true,
    actions: [
      { order: 1, type: 'door_control',   targetType: 'door',         action: 'unlock',  description: 'Mở khóa tất cả cửa thoát hiểm' },
      { order: 2, type: 'alarm_control',   targetType: 'zone',         action: 'arm',     description: 'Kích hoạt báo cháy toàn tòa nhà' },
      { order: 3, type: 'camera_control',  targetType: 'camera',       action: 'record',  description: 'Ghi hình chất lượng cao tất cả camera' },
      { order: 4, type: 'lift_control',    targetType: 'lift',         action: 'recall',  description: 'Thu hồi thang máy về tầng trệt' },
      { order: 5, type: 'intercom',        targetType: 'intercom',     action: 'announce', description: 'Phát loa sơ tán (VN + EN)' },
      { order: 6, type: 'notification',    targetType: 'notification', action: 'alert',   description: 'Gửi thông báo SMS + Push cho toàn bộ nhân viên' },
    ],
    allClearActions: [
      { order: 1, type: 'door_control',   targetType: 'door',         action: 'lock',    description: 'Khôi phục chế độ cửa bình thường' },
      { order: 2, type: 'alarm_control',   targetType: 'zone',         action: 'disarm',  description: 'Tắt báo cháy' },
      { order: 3, type: 'notification',    targetType: 'notification', action: 'alert',   description: 'Thông báo an toàn' },
    ],
    lastActivatedAt: '2026-02-16T16:00:00Z',
    lastDrillAt: '2026-03-01T10:00:00Z',
    createdAt: '2025-06-15T00:00:00Z',
  },
  {
    id: 'plan-2',
    name: 'Phong tỏa an ninh — Tầng 3',
    type: 'lockdown',
    scope: 'floor',
    severity: 'high',
    confirmationRequired: true,
    countdownSeconds: 5,
    enabled: true,
    actions: [
      { order: 1, type: 'door_control',   targetType: 'zone',         action: 'lock',    description: 'Khóa tất cả cửa khu vực tầng 3' },
      { order: 2, type: 'camera_control',  targetType: 'camera',       action: 'record',  description: 'Ghi hình chất lượng cao khu vực' },
      { order: 3, type: 'alarm_control',   targetType: 'zone',         action: 'arm',     description: 'Kích hoạt báo động an ninh' },
      { order: 4, type: 'notification',    targetType: 'notification', action: 'alert',   description: 'Thông báo lực lượng bảo vệ' },
    ],
    allClearActions: [
      { order: 1, type: 'door_control',   targetType: 'zone',         action: 'unlock',  description: 'Mở khóa cửa tầng 3' },
      { order: 2, type: 'alarm_control',   targetType: 'zone',         action: 'disarm',  description: 'Tắt báo động' },
    ],
    lastActivatedAt: null,
    lastDrillAt: '2026-02-20T14:00:00Z',
    createdAt: '2025-08-10T00:00:00Z',
  },
  {
    id: 'plan-3',
    name: 'Cấp cứu y tế — Lối thoát nhanh',
    type: 'medical',
    scope: 'building_wide',
    severity: 'high',
    confirmationRequired: false,
    countdownSeconds: 0,
    enabled: true,
    actions: [
      { order: 1, type: 'door_control',   targetType: 'door',         action: 'unlock',  description: 'Mở lối đi ngắn nhất đến phòng y tế' },
      { order: 2, type: 'notification',    targetType: 'notification', action: 'alert',   description: 'Thông báo đội sơ cứu' },
      { order: 3, type: 'camera_control',  targetType: 'camera',       action: 'record',  description: 'Ghi hình khu vực sự cố' },
    ],
    allClearActions: [
      { order: 1, type: 'door_control',   targetType: 'door',         action: 'lock',    description: 'Khôi phục chế độ cửa' },
    ],
    lastActivatedAt: '2026-02-17T10:00:00Z',
    lastDrillAt: null,
    createdAt: '2025-09-01T00:00:00Z',
  },
  {
    id: 'plan-4',
    name: 'Chống xâm nhập — Toàn tòa nhà',
    type: 'intruder',
    scope: 'building_wide',
    severity: 'critical',
    confirmationRequired: true,
    countdownSeconds: 5,
    enabled: false,
    actions: [
      { order: 1, type: 'door_control',   targetType: 'door',         action: 'lock',    description: 'Khóa toàn bộ cửa ra vào' },
      { order: 2, type: 'camera_control',  targetType: 'camera',       action: 'record',  description: 'Ghi hình + theo dõi AI' },
      { order: 3, type: 'alarm_control',   targetType: 'zone',         action: 'arm',     description: 'Kích hoạt báo động toàn bộ' },
      { order: 4, type: 'intercom',        targetType: 'intercom',     action: 'announce', description: 'Cảnh báo qua loa' },
      { order: 5, type: 'notification',    targetType: 'notification', action: 'alert',   description: 'Liên hệ công an 113 + bảo vệ' },
    ],
    allClearActions: [
      { order: 1, type: 'door_control',   targetType: 'door',         action: 'unlock',  description: 'Mở khóa cửa' },
      { order: 2, type: 'alarm_control',   targetType: 'zone',         action: 'disarm',  description: 'Tắt báo động' },
      { order: 3, type: 'notification',    targetType: 'notification', action: 'alert',   description: 'Thông báo hết nguy hiểm' },
    ],
    lastActivatedAt: '2026-02-18T14:30:00Z',
    lastDrillAt: '2026-01-15T09:00:00Z',
    createdAt: '2025-07-20T00:00:00Z',
  },
];

/* ── Emergency contacts ────────────────────────────────────────── */

export interface EmergencyContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  organization: string | null;
  types: EmergencyType[];
  priority: number;
  available: boolean;
}

export const mockContacts: EmergencyContact[] = [
  { id: 'c1', name: 'Nguyễn Văn Hùng',  role: 'Đội trưởng PCCC',      phone: '0901 234 567', organization: null,             types: ['fire'],               priority: 1, available: true },
  { id: 'c2', name: 'Trần Minh Đức',     role: 'Trưởng bảo vệ',        phone: '0912 345 678', organization: null,             types: ['lockdown', 'intruder'], priority: 1, available: true },
  { id: 'c3', name: 'Lê Thị Hương',      role: 'Y tá trực',            phone: '0923 456 789', organization: null,             types: ['medical'],            priority: 1, available: true },
  { id: 'c4', name: 'Phòng cháy chữa cháy', role: 'Cứu hỏa',          phone: '114',          organization: 'Sở PCCC TP.HCM', types: ['fire'],               priority: 2, available: true },
  { id: 'c5', name: 'Công an phường',     role: 'Trực ban',             phone: '113',          organization: 'CA Phường',      types: ['lockdown', 'intruder'], priority: 2, available: true },
  { id: 'c6', name: 'Cấp cứu 115',       role: 'Cấp cứu',             phone: '115',          organization: 'Trung tâm CC',   types: ['medical'],            priority: 2, available: true },
  { id: 'c7', name: 'Phạm Quốc Bảo',     role: 'Quản lý tòa nhà',     phone: '0934 567 890', organization: null,             types: ['fire', 'lockdown', 'medical', 'intruder'], priority: 3, available: false },
  { id: 'c8', name: 'Võ Thành Nam',       role: 'Kỹ sư điện',          phone: '0945 678 901', organization: null,             types: ['fire'],               priority: 3, available: true },
];

/* ── Incidents (history) ───────────────────────────────────────── */

export interface EmergencyIncident {
  id: string;
  planId: string;
  planName: string;
  type: EmergencyType;
  status: IncidentStatus;
  isDrill: boolean;
  triggeredBy: string;
  triggerSource: 'manual' | 'sensor' | 'ai';
  activatedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  devicesAcked: number;
  devicesTotal: number;
  description: string;
}

export const mockIncidents: EmergencyIncident[] = [
  { id: 'inc-1',  planId: 'plan-1', planName: 'Sơ tán hỏa hoạn', type: 'fire',     status: 'resolved',  isDrill: false, triggeredBy: 'Cảm biến khói',     triggerSource: 'sensor', activatedAt: '2026-02-16 16:00', resolvedAt: '2026-02-16 16:45', durationSeconds: 2700, devicesAcked: 42, devicesTotal: 45, description: 'Chập điện phòng kỹ thuật B2' },
  { id: 'inc-2',  planId: 'plan-4', planName: 'Chống xâm nhập',   type: 'intruder', status: 'resolved',  isDrill: false, triggeredBy: 'Hệ thống AI',       triggerSource: 'ai',     activatedAt: '2026-02-18 14:30', resolvedAt: '2026-02-18 14:55', durationSeconds: 1500, devicesAcked: 38, devicesTotal: 38, description: 'Phát hiện người lạ khu vực server' },
  { id: 'inc-3',  planId: 'plan-3', planName: 'Cấp cứu y tế',    type: 'medical',  status: 'resolved',  isDrill: false, triggeredBy: 'Lê Thị B',          triggerSource: 'manual', activatedAt: '2026-02-17 10:00', resolvedAt: '2026-02-17 10:30', durationSeconds: 1800, devicesAcked: 12, devicesTotal: 12, description: 'Nhân viên ngất tại tầng 3' },
  { id: 'inc-4',  planId: 'plan-1', planName: 'Sơ tán hỏa hoạn', type: 'fire',     status: 'resolved',  isDrill: true,  triggeredBy: 'BQL Tòa nhà',       triggerSource: 'manual', activatedAt: '2026-03-01 10:00', resolvedAt: '2026-03-01 10:35', durationSeconds: 2100, devicesAcked: 45, devicesTotal: 45, description: 'Diễn tập PCCC định kỳ Q1' },
  { id: 'inc-5',  planId: 'plan-2', planName: 'Phong tỏa tầng 3', type: 'lockdown', status: 'resolved',  isDrill: true,  triggeredBy: 'Trần Văn C',        triggerSource: 'manual', activatedAt: '2026-02-20 14:00', resolvedAt: '2026-02-20 14:30', durationSeconds: 1800, devicesAcked: 8,  devicesTotal: 8,  description: 'Diễn tập phong tỏa tầng 3' },
  { id: 'inc-6',  planId: 'plan-4', planName: 'Chống xâm nhập',   type: 'intruder', status: 'resolved',  isDrill: false, triggeredBy: 'Bảo vệ ca đêm',    triggerSource: 'manual', activatedAt: '2026-02-14 20:00', resolvedAt: '2026-02-14 20:40', durationSeconds: 2400, devicesAcked: 35, devicesTotal: 38, description: 'Người lạ cố gắng vào bãi xe' },
  { id: 'inc-7',  planId: 'plan-3', planName: 'Cấp cứu y tế',    type: 'medical',  status: 'resolved',  isDrill: false, triggeredBy: 'Phạm Thị D',        triggerSource: 'manual', activatedAt: '2026-02-13 11:30', resolvedAt: '2026-02-13 11:50', durationSeconds: 1200, devicesAcked: 12, devicesTotal: 12, description: 'Tai nạn lao động nhẹ tầng 4' },
  { id: 'inc-8',  planId: 'plan-1', planName: 'Sơ tán hỏa hoạn', type: 'fire',     status: 'resolved',  isDrill: false, triggeredBy: 'Nguyễn Văn A',      triggerSource: 'manual', activatedAt: '2026-02-19 06:00', resolvedAt: '2026-02-19 06:15', durationSeconds: 900,  devicesAcked: 44, devicesTotal: 45, description: 'Báo cháy giả — khói từ bếp tầng 1' },
  { id: 'inc-9',  planId: 'plan-2', planName: 'Phong tỏa tầng 3', type: 'lockdown', status: 'resolved',  isDrill: false, triggeredBy: 'BQL Tòa nhà',       triggerSource: 'manual', activatedAt: '2026-02-11 15:00', resolvedAt: '2026-02-11 17:00', durationSeconds: 7200, devicesAcked: 8,  devicesTotal: 8,  description: 'Phong tỏa do cảnh báo an ninh' },
  { id: 'inc-10', planId: 'plan-4', planName: 'Chống xâm nhập',   type: 'intruder', status: 'resolved',  isDrill: false, triggeredBy: 'Camera AI',          triggerSource: 'ai',     activatedAt: '2026-02-10 22:00', resolvedAt: '2026-02-10 22:35', durationSeconds: 2100, devicesAcked: 36, devicesTotal: 38, description: 'Cảnh báo xâm nhập sân thượng' },
];
