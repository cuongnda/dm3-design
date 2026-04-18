import { Box, Footprints, Siren, Users, UsersRound, type LucideIcon } from 'lucide-react';

export type DetectionType = 'intrusion' | 'loitering' | 'tailgating' | 'abandoned-object' | 'crowd';

export interface AIEvent {
  id: string;
  time: string;
  type: DetectionType;
  location: string;
  camera: string;
  confidence: number;
  falsePositive: boolean;
  description: string;
}

export const detectionTypeConfig: Record<DetectionType, { label: string; Icon: LucideIcon; color: string }> = {
  intrusion: { label: 'Xâm nhập', Icon: Siren, color: '#EF4444' },
  loitering: { label: 'Lảng vảng', Icon: Footprints, color: '#F59E0B' },
  tailgating: { label: 'Tailgating', Icon: Users, color: '#8B5CF6' },
  'abandoned-object': { label: 'Vật thể lạ', Icon: Box, color: '#3B82F6' },
  crowd: { label: 'Tụ tập đông', Icon: UsersRound, color: '#06B6D4' },
};

export const mockAIEvents: AIEvent[] = [
  { id: 'ai1', time: '2026-02-19 07:02', type: 'intrusion', location: 'Cổng phụ phía Bắc', camera: 'CAM-05', confidence: 94, falsePositive: false, description: 'Người lạ leo hàng rào' },
  { id: 'ai2', time: '2026-02-19 06:55', type: 'loitering', location: 'Sảnh chính Tầng 1', camera: 'CAM-01', confidence: 78, falsePositive: false, description: 'Người đứng lâu >10 phút' },
  { id: 'ai3', time: '2026-02-19 06:40', type: 'tailgating', location: 'Cửa văn phòng Tầng 3', camera: 'CAM-08', confidence: 85, falsePositive: false, description: '2 người qua cửa cùng lúc' },
  { id: 'ai4', time: '2026-02-19 06:30', type: 'abandoned-object', location: 'Hành lang B Tầng 2', camera: 'CAM-06', confidence: 72, falsePositive: true, description: 'Túi xách để quên - đã xác nhận' },
  { id: 'ai5', time: '2026-02-19 06:15', type: 'crowd', location: 'Sảnh thang máy Tầng 1', camera: 'CAM-02', confidence: 88, falsePositive: false, description: 'Tụ tập >10 người' },
  { id: 'ai6', time: '2026-02-19 05:50', type: 'loitering', location: 'Bãi xe B1', camera: 'CAM-12', confidence: 65, falsePositive: true, description: 'Tài xế chờ khách' },
  { id: 'ai7', time: '2026-02-19 05:30', type: 'intrusion', location: 'Kho hàng B2', camera: 'CAM-14', confidence: 91, falsePositive: false, description: 'Xâm nhập khu vực cấm' },
  { id: 'ai8', time: '2026-02-19 05:00', type: 'tailgating', location: 'Cổng chính', camera: 'CAM-03', confidence: 82, falsePositive: false, description: 'Nhân viên mở cửa cho người lạ' },
  { id: 'ai9', time: '2026-02-19 04:30', type: 'abandoned-object', location: 'Phòng họp A Tầng 4', camera: 'CAM-09', confidence: 68, falsePositive: true, description: 'Ba lô nhân viên' },
  { id: 'ai10', time: '2026-02-19 04:00', type: 'loitering', location: 'Lối vào tầng hầm', camera: 'CAM-13', confidence: 76, falsePositive: false, description: 'Người đi lại khu vực hạn chế' },
  { id: 'ai11', time: '2026-02-19 03:30', type: 'intrusion', location: 'Sân thượng', camera: 'CAM-16', confidence: 97, falsePositive: false, description: 'Phát hiện người trên sân thượng' },
  { id: 'ai12', time: '2026-02-19 03:00', type: 'crowd', location: 'Canteen Tầng 1', camera: 'CAM-04', confidence: 60, falsePositive: true, description: 'Giờ nghỉ ca đêm' },
  { id: 'ai13', time: '2026-02-18 23:30', type: 'tailgating', location: 'Cửa phòng server', camera: 'CAM-07', confidence: 90, falsePositive: false, description: 'Tailgating vào phòng server' },
  { id: 'ai14', time: '2026-02-18 22:00', type: 'loitering', location: 'Hành lang C Tầng 5', camera: 'CAM-10', confidence: 71, falsePositive: false, description: 'Người đứng ngoài VP giám đốc' },
  { id: 'ai15', time: '2026-02-18 21:00', type: 'abandoned-object', location: 'Sảnh thang bộ Tầng 3', camera: 'CAM-08', confidence: 80, falsePositive: false, description: 'Hộp lạ tại cầu thang' },
  { id: 'ai16', time: '2026-02-18 20:00', type: 'intrusion', location: 'Khu kỹ thuật', camera: 'CAM-15', confidence: 86, falsePositive: false, description: 'Truy cập ngoài giờ' },
  { id: 'ai17', time: '2026-02-18 19:00', type: 'crowd', location: 'Cổng chính', camera: 'CAM-03', confidence: 75, falsePositive: false, description: 'Đông người giờ tan ca' },
  { id: 'ai18', time: '2026-02-18 18:00', type: 'loitering', location: 'Bãi xe ngoài trời', camera: 'CAM-11', confidence: 63, falsePositive: true, description: 'Nhân viên chờ xe' },
  { id: 'ai19', time: '2026-02-18 17:00', type: 'tailgating', location: 'Cửa văn phòng Tầng 2', camera: 'CAM-06', confidence: 79, falsePositive: false, description: 'Khách vào theo nhân viên' },
  { id: 'ai20', time: '2026-02-18 16:00', type: 'abandoned-object', location: 'Thang máy B', camera: 'CAM-02', confidence: 74, falsePositive: false, description: 'Hộp carton trong thang máy' },
  { id: 'ai21', time: '2026-02-18 15:00', type: 'intrusion', location: 'Cổng phụ phía Bắc', camera: 'CAM-05', confidence: 92, falsePositive: false, description: 'Vượt rào khu vực cấm' },
  { id: 'ai22', time: '2026-02-18 14:00', type: 'crowd', location: 'Sảnh chính Tầng 1', camera: 'CAM-01', confidence: 70, falsePositive: true, description: 'Đoàn khách tham quan' },
  { id: 'ai23', time: '2026-02-18 13:00', type: 'loitering', location: 'Phòng ATM', camera: 'CAM-04', confidence: 83, falsePositive: false, description: 'Người đứng trước ATM >15 phút' },
  { id: 'ai24', time: '2026-02-18 12:00', type: 'tailgating', location: 'Cổng chính', camera: 'CAM-03', confidence: 88, falsePositive: false, description: 'Nhiều người vào cùng thẻ' },
  { id: 'ai25', time: '2026-02-18 11:00', type: 'abandoned-object', location: 'Ghế chờ Tầng 1', camera: 'CAM-01', confidence: 55, falsePositive: true, description: 'Hành lý khách' },
];
