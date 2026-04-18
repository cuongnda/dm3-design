export interface DomainReport {
  domain: string;
  color: string;
  icon: string;
  metrics: { label: string; value: string; change: string; direction: 'up' | 'down' }[];
}

export interface ChartData {
  label: string;
  value: number;
}

export const domainReports: DomainReport[] = [
  {
    domain: 'SECURE', color: '#3B82F6', icon: '🛡️',
    metrics: [
      { label: 'Sự cố bảo mật', value: '3', change: '-40%', direction: 'down' },
      { label: 'Lượt ra vào', value: '12,450', change: '+8%', direction: 'up' },
      { label: 'Camera online', value: '98%', change: '+2%', direction: 'up' },
    ],
  },
  {
    domain: 'MANAGE', color: '#8B5CF6', icon: '👥',
    metrics: [
      { label: 'Nhân viên hoạt động', value: '245', change: '+5', direction: 'up' },
      { label: 'Khách đến thăm', value: '89', change: '+12%', direction: 'up' },
      { label: 'Tỷ lệ chấm công', value: '94%', change: '-1%', direction: 'down' },
    ],
  },
  {
    domain: 'OPERATE', color: '#F59E0B', icon: '⚙️',
    metrics: [
      { label: 'Yêu cầu bảo trì', value: '20', change: '+3', direction: 'up' },
      { label: 'Bãi xe sử dụng', value: '64%', change: '+5%', direction: 'up' },
      { label: 'Phòng họp đặt', value: '8/10', change: '0%', direction: 'up' },
    ],
  },
  {
    domain: 'SMART', color: '#06B6D4', icon: '🤖',
    metrics: [
      { label: 'Câu hỏi AI', value: '156', change: '+25%', direction: 'up' },
      { label: 'Tự động hóa chạy', value: '342', change: '+18%', direction: 'up' },
      { label: 'Tiết kiệm năng lượng', value: '12%', change: '+3%', direction: 'up' },
    ],
  },
];

export const occupancyData: ChartData[] = [
  { label: 'T2', value: 78 }, { label: 'T3', value: 85 }, { label: 'T4', value: 82 },
  { label: 'T5', value: 90 }, { label: 'T6', value: 75 }, { label: 'T7', value: 45 }, { label: 'CN', value: 20 },
];

export const accessTrend: ChartData[] = [
  { label: '6h', value: 120 }, { label: '8h', value: 850 }, { label: '10h', value: 320 },
  { label: '12h', value: 780 }, { label: '14h', value: 280 }, { label: '16h', value: 450 },
  { label: '18h', value: 920 }, { label: '20h', value: 150 },
];

export const energyTrend: ChartData[] = [
  { label: 'T9', value: 42 }, { label: 'T10', value: 45 }, { label: 'T11', value: 38 },
  { label: 'T12', value: 50 }, { label: 'T1', value: 47 }, { label: 'T2', value: 43 },
];
