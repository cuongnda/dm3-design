export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'new' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  timestamp: string;
  severity: AlertSeverity;
  source: string;
  message: string;
  status: AlertStatus;
}

export const severityConfig: Record<AlertSeverity, { label: string; color: string; bg: string }> = {
  critical: { label: 'Nghiêm trọng', color: '#EF4444', bg: 'bg-[#EF4444]/10 text-[#EF4444]' },
  warning: { label: 'Cảnh báo', color: '#F59E0B', bg: 'bg-[#F59E0B]/10 text-[#F59E0B]' },
  info: { label: 'Thông tin', color: '#3B82F6', bg: 'bg-[#3B82F6]/10 text-[#3B82F6]' },
};

export const statusConfig: Record<AlertStatus, { label: string; color: string }> = {
  new: { label: 'Mới', color: '#EF4444' },
  acknowledged: { label: 'Đã xác nhận', color: '#F59E0B' },
  resolved: { label: 'Đã xử lý', color: '#22C55E' },
};

export const mockAlerts: Alert[] = [
  { id: 'a1', timestamp: '04/03/2026 06:12', severity: 'critical', source: 'Cổng chính — Cảm biến cửa', message: 'Phát hiện mở cửa cưỡng bức tại cổng chính', status: 'new' },
  { id: 'a2', timestamp: '04/03/2026 06:05', severity: 'critical', source: 'Tầng 3 — Đầu báo khói', message: 'Báo cháy kích hoạt — Phòng server tầng 3', status: 'new' },
  { id: 'a3', timestamp: '04/03/2026 05:48', severity: 'critical', source: 'Camera C-07', message: 'Phát hiện xâm nhập khu vực hạn chế', status: 'acknowledged' },
  { id: 'a4', timestamp: '04/03/2026 05:30', severity: 'warning', source: 'Camera C-12', message: 'Camera ngoài trời mất kết nối', status: 'new' },
  { id: 'a5', timestamp: '04/03/2026 05:15', severity: 'warning', source: 'Tầng 2 — Cửa D-04', message: 'Cửa để mở quá 5 phút', status: 'acknowledged' },
  { id: 'a6', timestamp: '04/03/2026 04:50', severity: 'info', source: 'Hệ thống', message: 'Backup tự động hoàn tất thành công', status: 'resolved' },
  { id: 'a7', timestamp: '04/03/2026 04:32', severity: 'warning', source: 'Thang máy #2', message: 'Thang máy báo lỗi kỹ thuật — cần kiểm tra', status: 'new' },
  { id: 'a8', timestamp: '04/03/2026 04:10', severity: 'critical', source: 'Bãi xe B1 — Barrier', message: 'Barrier tự động không phản hồi', status: 'acknowledged' },
  { id: 'a9', timestamp: '04/03/2026 03:45', severity: 'info', source: 'Cổng phụ', message: 'Truy cập ngoài giờ — Nguyễn Văn A (thẻ #1247)', status: 'resolved' },
  { id: 'a10', timestamp: '04/03/2026 03:20', severity: 'warning', source: 'Tầng 5 — Cảm biến chuyển động', message: 'Phát hiện chuyển động bất thường ngoài giờ làm việc', status: 'resolved' },
  { id: 'a11', timestamp: '04/03/2026 02:55', severity: 'info', source: 'Hệ thống HVAC', message: 'Nhiệt độ phòng server vượt 28°C', status: 'acknowledged' },
  { id: 'a12', timestamp: '04/03/2026 02:30', severity: 'warning', source: 'UPS — Tầng hầm', message: 'UPS chuyển sang chế độ pin — mất nguồn chính', status: 'resolved' },
  { id: 'a13', timestamp: '04/03/2026 01:15', severity: 'info', source: 'Hệ thống', message: 'Cập nhật firmware hoàn tất cho 12 thiết bị', status: 'resolved' },
  { id: 'a14', timestamp: '04/03/2026 00:45', severity: 'critical', source: 'Tầng 1 — Cảm biến rung', message: 'Phát hiện rung động bất thường — tường rào phía Đông', status: 'resolved' },
  { id: 'a15', timestamp: '03/03/2026 23:30', severity: 'info', source: 'Ca trực đêm', message: 'Bảo vệ Trần Văn B hoàn thành tuần tra lúc 23:30', status: 'resolved' },
];
