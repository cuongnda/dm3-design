export interface AttendanceRecord {
  id: string;
  name: string;
  department: string;
  clockIn: string | null;
  clockOut: string | null;
  hours: number;
  status: 'on-time' | 'late' | 'absent' | 'on-leave';
  shift: 'Sáng' | 'Chiều' | 'Hành chính';
}

const names = [
  'Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em',
  'Vũ Đức Phong', 'Đặng Thị Giang', 'Bùi Quốc Huy', 'Ngô Thị Lan', 'Đỗ Minh Khôi',
  'Trịnh Thị Linh', 'Lý Văn Minh', 'Phan Thị Ngọc', 'Dương Hữu Phước', 'Hà Thị Quỳnh',
  'Mai Đức Sơn', 'Tô Thị Trang', 'Võ Minh Uy', 'Châu Thị Vân', 'Lưu Quốc Vinh',
  'Nguyễn Thị Xuân', 'Trần Đức Yên', 'Lê Thị Ánh', 'Phạm Văn Bảo', 'Hoàng Thị Chi',
  'Vũ Đức Dũng', 'Đặng Thị Hà', 'Bùi Minh Khang', 'Ngô Thị Mai', 'Đỗ Văn Nam',
];
const depts = ['Kỹ thuật', 'Kinh doanh', 'Hành chính', 'Ban giám đốc'];
const shifts: AttendanceRecord['shift'][] = ['Hành chính', 'Sáng', 'Chiều'];

export const mockAttendance: AttendanceRecord[] = names.map((name, i) => {
  const status: AttendanceRecord['status'] =
    i === 5 || i === 18 ? 'absent' :
    i === 12 || i === 27 ? 'on-leave' :
    i % 5 === 3 ? 'late' : 'on-time';

  const clockIn = status === 'absent' ? null :
    status === 'on-leave' ? null :
    status === 'late' ? `08:${String(15 + (i % 30)).padStart(2, '0')}` :
    `07:${String(45 + (i % 15)).padStart(2, '0')}`;
  const clockOut = !clockIn ? null : `17:${String((i * 7) % 30 + 1).padStart(2, '0')}`;
  const hours = clockIn && clockOut ? parseFloat((8 + (i % 3) * 0.5).toFixed(1)) : 0;

  return {
    id: `A${String(i + 1).padStart(3, '0')}`,
    name,
    department: depts[i % depts.length],
    clockIn,
    clockOut,
    hours,
    status,
    shift: shifts[i % shifts.length],
  };
});

export const summary = {
  onTime: mockAttendance.filter(a => a.status === 'on-time').length,
  late: mockAttendance.filter(a => a.status === 'late').length,
  absent: mockAttendance.filter(a => a.status === 'absent').length,
  onLeave: mockAttendance.filter(a => a.status === 'on-leave').length,
  total: mockAttendance.length,
};
