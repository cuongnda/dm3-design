export interface Person {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: 'active' | 'inactive' | 'suspended';
  credentials: { card: boolean; face: boolean; mobile: boolean };
  cardUid?: string;
  accessGroups: string[];
  recentEvents: { time: string; door: string; result: 'granted' | 'denied' }[];
}

const depts = ['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'];
const roles = ['Nhân viên', 'Trưởng nhóm', 'Quản lý', 'Giám đốc', 'Thực tập sinh'];
const doors = ['Main Entrance', 'Office Wing', 'Server Room', 'Lab Access', 'Meeting Zone', 'Parking Gate'];

const names = [
  'Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em',
  'Vũ Đức Phong', 'Đặng Thị Giang', 'Bùi Quốc Huy', 'Ngô Thị Lan', 'Đỗ Minh Khôi',
  'Trịnh Thị Linh', 'Lý Văn Minh', 'Phan Thị Ngọc', 'Dương Hữu Phước', 'Hà Thị Quỳnh',
  'Mai Đức Sơn', 'Tô Thị Trang', 'Võ Minh Uy', 'Châu Thị Vân', 'Lưu Quốc Vinh',
  'Nguyễn Thị Xuân', 'Trần Đức Yên', 'Lê Thị Ánh', 'Phạm Văn Bảo', 'Hoàng Thị Chi',
  'Vũ Đức Dũng', 'Đặng Thị Hà', 'Bùi Minh Khang', 'Ngô Thị Mai', 'Đỗ Văn Nam',
];

export const mockPeople: Person[] = names.map((name, i) => {
  const dept = depts[i % depts.length];
  const role = i < 2 ? 'Giám đốc' : i < 6 ? 'Quản lý' : i < 12 ? 'Trưởng nhóm' : roles[i % roles.length];
  const status: Person['status'] = i === 28 ? 'suspended' : i === 25 ? 'inactive' : 'active';
  return {
    id: `P${String(i + 1).padStart(3, '0')}`,
    name,
    email: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/\s+/g, '.') + '@company.vn',
    phone: `09${String(10000000 + i * 1234567).slice(0, 8)}`,
    department: dept,
    role,
    status,
    credentials: {
      card: i % 3 !== 2,
      face: i % 4 !== 3,
      mobile: i % 5 !== 4,
    },
    cardUid: i % 3 !== 2 ? `UID-${String(i * 7 + 1000).padStart(6, '0')}` : undefined,
    accessGroups: i < 4 ? ['All Areas', 'VIP'] : i < 12 ? ['Office', 'Meeting'] : ['Office'],
    recentEvents: Array.from({ length: 10 }, (_, j) => ({
      time: `${String(8 + Math.floor(j / 2)).padStart(2, '0')}:${String((j * 7) % 60).padStart(2, '0')}`,
      door: doors[j % doors.length],
      result: (j === 3 && i % 5 === 0 ? 'denied' : 'granted') as 'granted' | 'denied',
    })),
  };
});
