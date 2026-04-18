export interface Session {
  id: string;
  device: string;
  location: string;
  lastActive: string;
  current: boolean;
}

export const userProfile = {
  name: 'Nguyễn Văn An',
  email: 'an.nguyen@dm3.vn',
  phone: '0901 234 567',
  department: 'Ban giám đốc',
  role: 'Quản trị viên',
  avatar: '',
};

export const sessions: Session[] = [
  { id: 'S01', device: 'Chrome trên MacBook Pro', location: 'TP.HCM, Việt Nam', lastActive: 'Đang hoạt động', current: true },
  { id: 'S02', device: 'Safari trên iPhone 15', location: 'TP.HCM, Việt Nam', lastActive: '2 giờ trước', current: false },
  { id: 'S03', device: 'Firefox trên Windows PC', location: 'Hà Nội, Việt Nam', lastActive: '1 ngày trước', current: false },
];

export const notificationSettings = {
  email: true,
  push: true,
  sms: false,
  securityAlerts: true,
  maintenanceUpdates: true,
  bookingReminders: true,
  weeklyReport: false,
};
