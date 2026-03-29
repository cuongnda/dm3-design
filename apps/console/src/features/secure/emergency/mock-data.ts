export type EmergencyType = 'fire' | 'lockdown' | 'medical' | 'intruder';
export type EventStatus = 'active' | 'resolved';

export interface ResponsePlan {
  id: string;
  name: string;
  type: EmergencyType;
  steps: string[];
  contacts: string[];
}

export interface EmergencyEvent {
  id: string;
  time: string;
  type: EmergencyType;
  activatedBy: string;
  duration: string;
  status: EventStatus;
  description: string;
}

export const emergencyTypeConfig: Record<EmergencyType, { label: string; icon: string; color: string; bg: string }> = {
  fire: { label: 'Hỏa hoạn', icon: '🔥', color: '#EF4444', bg: 'bg-[#EF4444]' },
  lockdown: { label: 'Phong tỏa', icon: '🔒', color: '#F59E0B', bg: 'bg-[#F59E0B]' },
  medical: { label: 'Y tế', icon: '🏥', color: '#22C55E', bg: 'bg-[#22C55E]' },
  intruder: { label: 'Kẻ xâm nhập', icon: '👤', color: '#8B5CF6', bg: 'bg-[#8B5CF6]' },
};

export const mockResponsePlans: ResponsePlan[] = [
  {
    id: 'rp1',
    name: 'Phương án PCCC',
    type: 'fire',
    steps: [
      'Kích hoạt báo cháy toàn tòa nhà',
      'Thông báo PCCC qua số 114',
      'Sơ tán nhân viên theo lối thoát hiểm',
      'Đội PCCC nội bộ triển khai chữa cháy',
      'Kiểm tra danh sách nhân viên tại điểm tập trung',
    ],
    contacts: ['Đội trưởng PCCC: Nguyễn Văn Hùng - 0901234567', 'Phòng cháy: 114', 'BQL Tòa nhà: 0281234567'],
  },
  {
    id: 'rp2',
    name: 'Phương án chống xâm nhập',
    type: 'intruder',
    steps: [
      'Phong tỏa khu vực phát hiện',
      'Thông báo lực lượng bảo vệ',
      'Khóa tất cả cửa ra vào khu vực',
      'Liên hệ công an: 113',
      'Theo dõi camera CCTV liên tục',
    ],
    contacts: ['Trưởng bảo vệ: Trần Minh Đức - 0912345678', 'Công an: 113', 'Quản lý an ninh: 0283456789'],
  },
];

export const mockEmergencyEvents: EmergencyEvent[] = [
  { id: 'ee1', time: '2026-02-19 06:00', type: 'fire', activatedBy: 'Nguyễn Văn A', duration: '15 phút', status: 'resolved', description: 'Báo cháy giả - khói từ bếp tầng 1' },
  { id: 'ee2', time: '2026-02-18 14:30', type: 'intruder', activatedBy: 'Hệ thống AI', duration: '25 phút', status: 'resolved', description: 'Phát hiện người lạ khu vực server' },
  { id: 'ee3', time: '2026-02-17 10:00', type: 'medical', activatedBy: 'Lê Thị B', duration: '30 phút', status: 'resolved', description: 'Nhân viên ngất tại tầng 3' },
  { id: 'ee4', time: '2026-02-16 16:00', type: 'fire', activatedBy: 'Cảm biến khói', duration: '45 phút', status: 'resolved', description: 'Chập điện phòng kỹ thuật B2' },
  { id: 'ee5', time: '2026-02-15 09:00', type: 'lockdown', activatedBy: 'Trần Văn C', duration: '1 giờ', status: 'resolved', description: 'Diễn tập phong tỏa tòa nhà' },
  { id: 'ee6', time: '2026-02-14 20:00', type: 'intruder', activatedBy: 'Bảo vệ ca đêm', duration: '40 phút', status: 'resolved', description: 'Người lạ cố gắng vào bãi xe' },
  { id: 'ee7', time: '2026-02-13 11:30', type: 'medical', activatedBy: 'Phạm Thị D', duration: '20 phút', status: 'resolved', description: 'Tai nạn lao động nhẹ tầng 4' },
  { id: 'ee8', time: '2026-02-12 08:00', type: 'fire', activatedBy: 'Hệ thống', duration: '10 phút', status: 'resolved', description: 'Diễn tập PCCC định kỳ' },
  { id: 'ee9', time: '2026-02-11 15:00', type: 'lockdown', activatedBy: 'BQL Tòa nhà', duration: '2 giờ', status: 'resolved', description: 'Phong tỏa do cảnh báo an ninh' },
  { id: 'ee10', time: '2026-02-10 22:00', type: 'intruder', activatedBy: 'Camera AI', duration: '35 phút', status: 'resolved', description: 'Cảnh báo xâm nhập sân thượng' },
];
