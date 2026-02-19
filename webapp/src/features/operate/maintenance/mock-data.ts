export interface WorkOrder {
  id: string;
  title: string;
  location: string;
  category: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in-progress' | 'completed' | 'cancelled';
  assignee: string;
  requestedBy: string;
  createdAt: string;
  completedAt?: string;
  description: string;
}

const titles = [
  'Sửa điều hòa tầng 3', 'Thay bóng đèn hành lang B2', 'Rò rỉ nước toilet nam T2',
  'Hỏng thang máy #2', 'Sửa cửa tự động sảnh chính', 'Thay lọc máy lọc nước T1',
  'Sơn lại tường phòng họp A', 'Kiểm tra hệ thống PCCC', 'Sửa ổ khóa phòng 305',
  'Thay gạch lát sàn B1', 'Bảo trì máy phát điện', 'Sửa vòi nước bếp T4',
  'Thay kính cửa sổ phòng 201', 'Kiểm tra đường ống nước', 'Sửa quạt thông gió B3',
  'Thay pin cảm biến khói', 'Bảo trì thang máy #1', 'Sửa hệ thống tưới cây',
  'Thay đèn LED parking B1', 'Sửa cổng barrier tầng hầm',
];
const locations = ['Tầng 1 - Sảnh', 'Tầng 2 - VP', 'Tầng 3 - VP', 'Tầng hầm B1', 'Tầng hầm B2', 'Tầng 4 - Canteen'];
const categories = ['Điện', 'Nước', 'HVAC', 'Cơ khí', 'Xây dựng', 'PCCC'];
const assignees = ['Nguyễn Văn Tài', 'Trần Đức Mạnh', 'Lê Thanh Hải', 'Phạm Quốc Bảo', 'Hoàng Minh Tuấn'];
const requesters = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em'];

export const workOrders: WorkOrder[] = titles.map((title, i) => ({
  id: `WO${String(i + 1).padStart(3, '0')}`,
  title,
  location: locations[i % locations.length],
  category: categories[i % categories.length],
  priority: i < 2 ? 'critical' : i < 5 ? 'high' : i < 12 ? 'medium' : 'low',
  status: i < 3 ? 'in-progress' : i < 10 ? 'open' : i < 17 ? 'completed' : 'cancelled',
  assignee: assignees[i % assignees.length],
  requestedBy: requesters[i % requesters.length],
  createdAt: `2025-02-${String(1 + i).padStart(2, '0')}`,
  completedAt: i >= 10 && i < 17 ? `2025-02-${String(5 + i).padStart(2, '0')}` : undefined,
  description: `Yêu cầu: ${title.toLowerCase()}. Vị trí: ${locations[i % locations.length]}.`,
}));

export const summary = {
  total: workOrders.length,
  open: workOrders.filter(w => w.status === 'open').length,
  inProgress: workOrders.filter(w => w.status === 'in-progress').length,
  completed: workOrders.filter(w => w.status === 'completed').length,
  critical: workOrders.filter(w => w.priority === 'critical').length,
};
