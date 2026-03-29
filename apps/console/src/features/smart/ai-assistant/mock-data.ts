export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  date: string;
  messageCount: number;
}

export const suggestedQueries = [
  '📊 Báo cáo năng lượng tháng này',
  '🚗 Tình trạng bãi đỗ xe hiện tại',
  '🔒 Danh sách sự cố bảo mật hôm nay',
  '👥 Thống kê chấm công tuần này',
  '🔧 Yêu cầu bảo trì đang chờ xử lý',
  '📅 Lịch đặt phòng họp ngày mai',
];

export const currentMessages: Message[] = [
  { id: 'M001', role: 'user', content: 'Cho tôi xem tình trạng bãi đỗ xe hiện tại', timestamp: '07:10' },
  { id: 'M002', role: 'assistant', content: 'Hiện tại bãi đỗ xe có tổng 200 chỗ, trong đó:\n- **Đang đỗ:** 128 xe (64%)\n- **Còn trống:** 62 chỗ\n- **Đặt trước:** 10 chỗ\n\nTầng B1 gần đầy (92%), B2 còn nhiều chỗ trống (45%).', timestamp: '07:10' },
  { id: 'M003', role: 'user', content: 'Có bao nhiêu yêu cầu bảo trì khẩn cấp?', timestamp: '07:12' },
  { id: 'M004', role: 'assistant', content: 'Hiện có **2 yêu cầu khẩn cấp** đang được xử lý:\n1. 🔴 **WO001** - Sửa điều hòa tầng 3 (Phụ trách: Nguyễn Văn Tài)\n2. 🔴 **WO002** - Thay bóng đèn hành lang B2 (Phụ trách: Trần Đức Mạnh)\n\nCả hai đều đang trong trạng thái "Đang xử lý".', timestamp: '07:12' },
];

export const conversations: Conversation[] = [
  { id: 'C001', title: 'Tình trạng bãi đỗ xe', lastMessage: 'Tầng B1 gần đầy...', date: '17/02/2025', messageCount: 4 },
  { id: 'C002', title: 'Báo cáo năng lượng T1', lastMessage: 'Tiêu thụ điện tăng 5%...', date: '16/02/2025', messageCount: 6 },
  { id: 'C003', title: 'Sự cố thang máy #2', lastMessage: 'Đã gửi yêu cầu bảo trì...', date: '15/02/2025', messageCount: 8 },
  { id: 'C004', title: 'Thống kê khách tháng 1', lastMessage: 'Tổng 1,234 lượt khách...', date: '14/02/2025', messageCount: 3 },
  { id: 'C005', title: 'Kiểm tra PCCC', lastMessage: 'Tất cả hệ thống hoạt động...', date: '13/02/2025', messageCount: 5 },
];
