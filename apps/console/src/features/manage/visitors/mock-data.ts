export interface Visitor {
  id: string;
  name: string;
  company: string;
  host: string;
  purpose: string;
  status: 'waiting' | 'checked-in' | 'checked-out';
  expectedTime: string;
  checkInTime?: string;
  checkOutTime?: string;
  preRegistered: boolean;
}

const purposes = ['Họp dự án', 'Phỏng vấn', 'Giao hàng', 'Bảo trì', 'Tham quan', 'Ký hợp đồng'];
const companies = ['FPT Software', 'Viettel Solutions', 'VNG Corp', 'TMA Solutions', 'KMS Technology', 'CMC Global', 'VNPT IT'];
const hosts = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em'];

const visitorNames = [
  'Lê Quang Hải', 'Nguyễn Thị Hồng', 'Trần Văn Đạt', 'Phạm Thị Loan', 'Hoàng Minh Tuấn',
  'Vũ Thị Phương', 'Đặng Văn Thắng', 'Bùi Thị Yến', 'Ngô Đức Thịnh', 'Đỗ Thị Hương',
  'Trịnh Văn Long', 'Lý Thị Thanh', 'Phan Đức Mạnh', 'Dương Thị Ngân', 'Hà Văn Quân',
  'Mai Thị Hà', 'Tô Văn Bình', 'Võ Thị Diệu', 'Châu Minh Hoàng', 'Lưu Thị Kim',
];

export const mockVisitors: Visitor[] = visitorNames.map((name, i) => {
  const status: Visitor['status'] = i < 5 ? 'waiting' : i < 12 ? 'checked-in' : 'checked-out';
  return {
    id: `V${String(i + 1).padStart(3, '0')}`,
    name,
    company: companies[i % companies.length],
    host: hosts[i % hosts.length],
    purpose: purposes[i % purposes.length],
    status,
    expectedTime: `${String(8 + Math.floor(i / 3)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`,
    checkInTime: status !== 'waiting' ? `${String(8 + Math.floor(i / 3)).padStart(2, '0')}:${String((i * 7 + 5) % 60).padStart(2, '0')}` : undefined,
    checkOutTime: status === 'checked-out' ? `${String(10 + Math.floor(i / 4)).padStart(2, '0')}:${String((i * 11) % 60).padStart(2, '0')}` : undefined,
    preRegistered: i < 5,
  };
});
