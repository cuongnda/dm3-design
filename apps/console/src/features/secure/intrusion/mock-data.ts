export type ZoneStatus = 'armed' | 'disarmed' | 'alarm';
export type SensorStatus = 'normal' | 'triggered' | 'offline' | 'tampered';
export type AlarmSeverity = 'critical' | 'high' | 'medium' | 'low';
export type AlarmStatus = 'active' | 'acknowledged' | 'resolved';

export interface Zone {
  id: string;
  name: string;
  floor: string;
  status: ZoneStatus;
  sensorCount: number;
  lastEvent: string;
}

export interface Sensor {
  id: string;
  name: string;
  zoneId: string;
  type: string;
  status: SensorStatus;
  location: string;
  battery: number;
}

export interface AlarmEvent {
  id: string;
  time: string;
  zone: string;
  type: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  description: string;
}

export const mockZones: Zone[] = [
  { id: 'z1', name: 'Sảnh chính - Tầng 1', floor: 'Tầng 1', status: 'armed', sensorCount: 5, lastEvent: '2026-02-19 06:30' },
  { id: 'z2', name: 'Kho hàng B2', floor: 'Tầng hầm', status: 'armed', sensorCount: 4, lastEvent: '2026-02-19 05:12' },
  { id: 'z3', name: 'Văn phòng Tầng 3', floor: 'Tầng 3', status: 'disarmed', sensorCount: 3, lastEvent: '2026-02-18 22:00' },
  { id: 'z4', name: 'Phòng server', floor: 'Tầng 2', status: 'armed', sensorCount: 4, lastEvent: '2026-02-19 06:55' },
  { id: 'z5', name: 'Bãi đỗ xe ngoài trời', floor: 'Ngoài trời', status: 'alarm', sensorCount: 2, lastEvent: '2026-02-19 07:01' },
  { id: 'z6', name: 'Khu vực kỹ thuật', floor: 'Tầng hầm', status: 'disarmed', sensorCount: 2, lastEvent: '2026-02-18 18:00' },
];

export const mockSensors: Sensor[] = [
  { id: 's1', name: 'PIR-001', zoneId: 'z1', type: 'PIR', status: 'normal', location: 'Cửa chính', battery: 95 },
  { id: 's2', name: 'MAG-001', zoneId: 'z1', type: 'Magnetic', status: 'normal', location: 'Cửa sổ trái', battery: 88 },
  { id: 's3', name: 'PIR-002', zoneId: 'z1', type: 'PIR', status: 'normal', location: 'Hành lang A', battery: 72 },
  { id: 's4', name: 'GLASS-001', zoneId: 'z1', type: 'Glass Break', status: 'normal', location: 'Kính sảnh', battery: 90 },
  { id: 's5', name: 'BEAM-001', zoneId: 'z1', type: 'Beam', status: 'normal', location: 'Lối vào phụ', battery: 85 },
  { id: 's6', name: 'PIR-003', zoneId: 'z2', type: 'PIR', status: 'normal', location: 'Lối vào kho', battery: 60 },
  { id: 's7', name: 'MAG-002', zoneId: 'z2', type: 'Magnetic', status: 'normal', location: 'Cửa kho chính', battery: 92 },
  { id: 's8', name: 'VIB-001', zoneId: 'z2', type: 'Vibration', status: 'offline', location: 'Tường phía Bắc', battery: 15 },
  { id: 's9', name: 'PIR-004', zoneId: 'z2', type: 'PIR', status: 'normal', location: 'Góc kho B', battery: 78 },
  { id: 's10', name: 'PIR-005', zoneId: 'z3', type: 'PIR', status: 'normal', location: 'Phòng họp 3A', battery: 80 },
  { id: 's11', name: 'MAG-003', zoneId: 'z3', type: 'Magnetic', status: 'normal', location: 'Cửa văn phòng', battery: 65 },
  { id: 's12', name: 'PIR-006', zoneId: 'z3', type: 'PIR', status: 'normal', location: 'Khu làm việc', battery: 91 },
  { id: 's13', name: 'TEMP-001', zoneId: 'z4', type: 'Temperature', status: 'normal', location: 'Rack A', battery: 100 },
  { id: 's14', name: 'MAG-004', zoneId: 'z4', type: 'Magnetic', status: 'normal', location: 'Cửa server', battery: 99 },
  { id: 's15', name: 'VIB-002', zoneId: 'z4', type: 'Vibration', status: 'normal', location: 'Sàn kỹ thuật', battery: 87 },
  { id: 's16', name: 'PIR-007', zoneId: 'z4', type: 'PIR', status: 'normal', location: 'Hành lang server', battery: 76 },
  { id: 's17', name: 'BEAM-002', zoneId: 'z5', type: 'Beam', status: 'triggered', location: 'Hàng rào Đông', battery: 55 },
  { id: 's18', name: 'PIR-008', zoneId: 'z5', type: 'PIR', status: 'triggered', location: 'Cổng phụ', battery: 43 },
  { id: 's19', name: 'PIR-009', zoneId: 'z6', type: 'PIR', status: 'normal', location: 'Phòng máy phát', battery: 82 },
  { id: 's20', name: 'MAG-005', zoneId: 'z6', type: 'Magnetic', status: 'tampered', location: 'Cửa kỹ thuật', battery: 70 },
];

export const mockAlarmEvents: AlarmEvent[] = [
  { id: 'a1', time: '2026-02-19 07:01', zone: 'Bãi đỗ xe ngoài trời', type: 'Xâm nhập', severity: 'critical', status: 'active', description: 'Phát hiện chuyển động tại hàng rào Đông' },
  { id: 'a2', time: '2026-02-19 06:55', zone: 'Phòng server', type: 'Cửa mở', severity: 'high', status: 'acknowledged', description: 'Cửa server mở ngoài giờ làm việc' },
  { id: 'a3', time: '2026-02-19 06:30', zone: 'Sảnh chính - Tầng 1', type: 'Chuyển động', severity: 'low', status: 'resolved', description: 'Phát hiện chuyển động - nhân viên bảo vệ' },
  { id: 'a4', time: '2026-02-19 05:12', zone: 'Kho hàng B2', type: 'Rung động', severity: 'medium', status: 'resolved', description: 'Cảm biến rung động tường phía Bắc' },
  { id: 'a5', time: '2026-02-19 03:45', zone: 'Bãi đỗ xe ngoài trời', type: 'Beam ngắt', severity: 'high', status: 'resolved', description: 'Ngắt tia beam cổng phụ' },
  { id: 'a6', time: '2026-02-18 23:30', zone: 'Sảnh chính - Tầng 1', type: 'Vỡ kính', severity: 'critical', status: 'resolved', description: 'Cảnh báo vỡ kính sảnh - kiểm tra: báo động giả' },
  { id: 'a7', time: '2026-02-18 22:15', zone: 'Văn phòng Tầng 3', type: 'Chuyển động', severity: 'low', status: 'resolved', description: 'Nhân viên làm thêm giờ' },
  { id: 'a8', time: '2026-02-18 20:00', zone: 'Khu vực kỹ thuật', type: 'Tamper', severity: 'high', status: 'resolved', description: 'Cảm biến bị can thiệp vật lý' },
  { id: 'a9', time: '2026-02-18 18:30', zone: 'Phòng server', type: 'Nhiệt độ', severity: 'medium', status: 'resolved', description: 'Nhiệt độ rack A vượt ngưỡng 28°C' },
  { id: 'a10', time: '2026-02-18 16:00', zone: 'Kho hàng B2', type: 'Cửa mở', severity: 'low', status: 'resolved', description: 'Cửa kho mở quá 5 phút' },
  { id: 'a11', time: '2026-02-18 14:20', zone: 'Sảnh chính - Tầng 1', type: 'Chuyển động', severity: 'low', status: 'resolved', description: 'Khách đến ngoài lịch hẹn' },
  { id: 'a12', time: '2026-02-18 11:00', zone: 'Bãi đỗ xe ngoài trời', type: 'Xâm nhập', severity: 'medium', status: 'resolved', description: 'Người lạ tiếp cận khu vực cấm' },
  { id: 'a13', time: '2026-02-18 09:30', zone: 'Phòng server', type: 'Cửa mở', severity: 'low', status: 'resolved', description: 'Nhân viên IT vào bảo trì' },
  { id: 'a14', time: '2026-02-18 07:00', zone: 'Khu vực kỹ thuật', type: 'Chuyển động', severity: 'low', status: 'resolved', description: 'Kỹ thuật viên kiểm tra thiết bị' },
  { id: 'a15', time: '2026-02-17 23:00', zone: 'Văn phòng Tầng 3', type: 'Chuyển động', severity: 'medium', status: 'resolved', description: 'Phát hiện chuyển động không xác định' },
];
