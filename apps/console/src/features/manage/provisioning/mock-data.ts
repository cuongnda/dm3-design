export interface RoleTemplate {
  id: string;
  name: string;
  doors: string[];
  zones: string[];
  schedule: string;
  assignedCount: number;
}

export interface ProvisioningRequest {
  id: string;
  requester: string;
  person: string;
  template: string;
  reason: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface AuditEntry {
  id: string;
  action: string;
  person: string;
  template: string;
  by: string;
  at: string;
}

export const mockTemplates: RoleTemplate[] = [
  { id: 'T1', name: 'Nhân viên', doors: ['Main Entrance', 'Office Wing', 'Turnstile 1', 'Turnstile 2'], zones: ['Office', 'Lobby'], schedule: '07:00-19:00 T2-T6', assignedCount: 18 },
  { id: 'T2', name: 'Quản lý', doors: ['Main Entrance', 'Office Wing', 'Meeting Zone', 'Server Room', 'Turnstile 1'], zones: ['Office', 'Lobby', 'Server'], schedule: '24/7', assignedCount: 6 },
  { id: 'T3', name: 'Khách', doors: ['Main Entrance', 'Meeting Zone'], zones: ['Lobby', 'Meeting'], schedule: '08:00-18:00 T2-T7', assignedCount: 0 },
  { id: 'T4', name: 'Nhà thầu', doors: ['Main Entrance', 'Loading Dock', 'Storage'], zones: ['Lobby', 'Service'], schedule: '07:00-17:00 T2-T6', assignedCount: 25 },
  { id: 'T5', name: 'VIP', doors: ['Main Entrance', 'Office Wing', 'Meeting Zone', 'Server Room', 'Lab Access', 'Rooftop'], zones: ['All'], schedule: '24/7', assignedCount: 4 },
];

export const mockRequests: ProvisioningRequest[] = [
  { id: 'R1', requester: 'Trần Thị Bích', person: 'Ngô Thị Mai', template: 'Quản lý', reason: 'Thăng chức', requestedAt: '2026-02-19 08:15', status: 'pending' },
  { id: 'R2', requester: 'Lê Hoàng Cường', person: 'Đỗ Văn Nam', template: 'Nhân viên', reason: 'Nhân viên mới', requestedAt: '2026-02-19 08:30', status: 'pending' },
  { id: 'R3', requester: 'Phạm Minh Đức', person: 'Bùi Minh Khang', template: 'VIP', reason: 'Dự án đặc biệt', requestedAt: '2026-02-19 09:00', status: 'pending' },
  { id: 'R4', requester: 'Hoàng Thị Em', person: 'Đặng Thị Hà', template: 'Quản lý', reason: 'Chuyển phòng ban', requestedAt: '2026-02-18 16:30', status: 'pending' },
  { id: 'R5', requester: 'Nguyễn Văn An', person: 'Vũ Đức Dũng', template: 'Nhà thầu', reason: 'Hợp đồng mới', requestedAt: '2026-02-18 15:00', status: 'pending' },
  { id: 'R6', requester: 'Trần Thị Bích', person: 'Lê Thị Ánh', template: 'Nhân viên', reason: 'Nhân viên mới', requestedAt: '2026-02-18 14:00', status: 'approved' },
  { id: 'R7', requester: 'Lê Hoàng Cường', person: 'Phạm Văn Bảo', template: 'VIP', reason: 'Yêu cầu truy cập', requestedAt: '2026-02-18 11:00', status: 'rejected' },
  { id: 'R8', requester: 'Phạm Minh Đức', person: 'Hoàng Thị Chi', template: 'Nhân viên', reason: 'Thực tập sinh', requestedAt: '2026-02-18 10:00', status: 'pending' },
];

export const mockAudit: AuditEntry[] = [
  { id: 'AU1', action: 'Cấp quyền', person: 'Lê Thị Ánh', template: 'Nhân viên', by: 'Nguyễn Văn An', at: '2026-02-18 14:30' },
  { id: 'AU2', action: 'Thu hồi quyền', person: 'Châu Thị Vân', template: 'Quản lý', by: 'Nguyễn Văn An', at: '2026-02-18 13:00' },
  { id: 'AU3', action: 'Cấp quyền', person: 'Trần Đức Yên', template: 'Nhân viên', by: 'Trần Thị Bích', at: '2026-02-17 16:00' },
  { id: 'AU4', action: 'Nâng cấp', person: 'Mai Đức Sơn', template: 'Quản lý', by: 'Nguyễn Văn An', at: '2026-02-17 10:00' },
  { id: 'AU5', action: 'Từ chối', person: 'Phạm Văn Bảo', template: 'VIP', by: 'Nguyễn Văn An', at: '2026-02-18 11:30' },
];
