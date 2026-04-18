export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  condition: string;
  action: string;
  enabled: boolean;
  lastRun?: string;
  runCount: number;
  createdBy: string;
}

export interface ExecutionLog {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: string;
  result: 'success' | 'failed' | 'skipped';
  timestamp: string;
  duration: string;
  details: string;
}

export const rules: AutomationRule[] = [
  { id: 'AR01', name: 'Tắt đèn ngoài giờ', description: 'Tự động tắt đèn sau 22:00', trigger: 'Lịch: 22:00 hàng ngày', condition: 'Không có người trong tòa nhà', action: 'Tắt tất cả đèn tầng 1-4', enabled: true, lastRun: '22:00 17/02', runCount: 45, createdBy: 'Admin' },
  { id: 'AR02', name: 'Cảnh báo nhiệt độ cao', description: 'Gửi thông báo khi nhiệt độ > 30°C', trigger: 'Cảm biến nhiệt độ > 30°C', condition: 'Giờ hành chính (8h-18h)', action: 'Gửi thông báo cho quản lý', enabled: true, lastRun: '14:30 17/02', runCount: 12, createdBy: 'Admin' },
  { id: 'AR03', name: 'Mở cổng barrier sáng', description: 'Mở cổng barrier tự động lúc 6:00', trigger: 'Lịch: 06:00 T2-T7', condition: 'Ngày làm việc', action: 'Mở cổng barrier B1, B2', enabled: true, lastRun: '06:00 17/02', runCount: 120, createdBy: 'Admin' },
  { id: 'AR04', name: 'Backup camera 2h/lần', description: 'Sao lưu dữ liệu camera mỗi 2 giờ', trigger: 'Lịch: Mỗi 2 giờ', condition: 'Luôn luôn', action: 'Backup NVR → Cloud', enabled: true, lastRun: '06:00 17/02', runCount: 340, createdBy: 'IT Admin' },
  { id: 'AR05', name: 'Thông báo khách VIP', description: 'Gửi thông báo khi nhận diện khách VIP', trigger: 'AI nhận diện khuôn mặt VIP', condition: 'Trong danh sách VIP', action: 'Thông báo lễ tân + quản lý', enabled: true, lastRun: '09:15 17/02', runCount: 8, createdBy: 'Admin' },
  { id: 'AR06', name: 'Đóng cửa sổ khi mưa', description: 'Tự động đóng cửa sổ khi phát hiện mưa', trigger: 'Cảm biến mưa = TRUE', condition: 'Cửa sổ đang mở', action: 'Đóng tất cả cửa sổ tự động', enabled: false, lastRun: '15:20 16/02', runCount: 5, createdBy: 'Admin' },
  { id: 'AR07', name: 'Bật HVAC trước giờ làm', description: 'Bật điều hòa 30 phút trước giờ hành chính', trigger: 'Lịch: 07:30 T2-T7', condition: 'Nhiệt độ > 25°C', action: 'Bật HVAC tầng 1-4', enabled: true, lastRun: '07:30 17/02', runCount: 90, createdBy: 'Admin' },
  { id: 'AR08', name: 'Cảnh báo bãi xe đầy', description: 'Thông báo khi bãi xe đạt 90%', trigger: 'Công suất bãi xe >= 90%', condition: 'Giờ hành chính', action: 'Thông báo bảo vệ + bảng LED', enabled: true, lastRun: '08:45 17/02', runCount: 15, createdBy: 'Admin' },
  { id: 'AR09', name: 'Khóa cửa ban đêm', description: 'Khóa tất cả cửa phụ sau 21:00', trigger: 'Lịch: 21:00 hàng ngày', condition: 'Luôn luôn', action: 'Khóa cửa phụ T1-T4', enabled: true, lastRun: '21:00 17/02', runCount: 60, createdBy: 'Security Admin' },
  { id: 'AR10', name: 'Báo cáo năng lượng tuần', description: 'Tự động gửi báo cáo năng lượng hàng tuần', trigger: 'Lịch: 08:00 Thứ Hai', condition: 'Luôn luôn', action: 'Gửi email báo cáo cho BGĐ', enabled: false, lastRun: '08:00 13/02', runCount: 6, createdBy: 'Admin' },
];

export const executionLogs: ExecutionLog[] = Array.from({ length: 20 }, (_, i) => ({
  id: `EL${String(i + 1).padStart(3, '0')}`,
  ruleId: rules[i % rules.length].id,
  ruleName: rules[i % rules.length].name,
  trigger: rules[i % rules.length].trigger,
  result: i === 5 ? 'failed' : i === 12 ? 'skipped' : 'success',
  timestamp: `${String(6 + (i % 16)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')} ${17 - Math.floor(i / 8)}/02`,
  duration: `${(0.1 + (i % 5) * 0.3).toFixed(1)}s`,
  details: i === 5 ? 'Lỗi kết nối thiết bị' : i === 12 ? 'Điều kiện không thỏa' : 'Thực hiện thành công',
}));

export const summary = {
  totalRules: rules.length,
  activeRules: rules.filter(r => r.enabled).length,
  totalExecutions: executionLogs.length,
  successRate: Math.round(executionLogs.filter(l => l.result === 'success').length / executionLogs.length * 100),
};
