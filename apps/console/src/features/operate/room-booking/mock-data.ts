export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  equipment: string[];
  status: 'available' | 'occupied' | 'maintenance';
}

export interface Booking {
  id: string;
  roomId: string;
  roomName: string;
  title: string;
  organizer: string;
  date: string;
  startTime: string;
  endTime: string;
  attendees: number;
  status: 'confirmed' | 'pending' | 'cancelled';
}

export const rooms: Room[] = [
  { id: 'R01', name: 'Hội trường A', floor: 1, capacity: 50, equipment: ['Máy chiếu', 'Micro', 'Bảng trắng'], status: 'available' },
  { id: 'R02', name: 'Phòng họp B1', floor: 1, capacity: 12, equipment: ['TV', 'Webcam'], status: 'occupied' },
  { id: 'R03', name: 'Phòng họp B2', floor: 1, capacity: 12, equipment: ['TV', 'Webcam'], status: 'available' },
  { id: 'R04', name: 'Phòng đào tạo C', floor: 2, capacity: 30, equipment: ['Máy chiếu', 'Micro', 'Máy tính'], status: 'available' },
  { id: 'R05', name: 'Phòng họp D1', floor: 2, capacity: 8, equipment: ['TV'], status: 'occupied' },
  { id: 'R06', name: 'Phòng họp D2', floor: 2, capacity: 8, equipment: ['TV'], status: 'available' },
  { id: 'R07', name: 'Phòng VIP', floor: 3, capacity: 20, equipment: ['Máy chiếu', 'Micro', 'Webcam', 'Bảng trắng'], status: 'available' },
  { id: 'R08', name: 'Phòng phỏng vấn E', floor: 3, capacity: 4, equipment: ['Webcam'], status: 'maintenance' },
  { id: 'R09', name: 'Phòng brainstorm F', floor: 3, capacity: 10, equipment: ['Bảng trắng', 'TV'], status: 'available' },
  { id: 'R10', name: 'Phòng giám đốc G', floor: 3, capacity: 6, equipment: ['TV', 'Webcam', 'Micro'], status: 'occupied' },
];

const bookingTitles = [
  'Họp dự án Alpha', 'Đánh giá quý III', 'Đào tạo nhân viên mới', 'Phỏng vấn ứng viên',
  'Họp khách hàng VinGroup', 'Review sprint 24', 'Thảo luận ngân sách 2025', 'Workshop UX/UI',
  'Họp ban giám đốc', 'Demo sản phẩm', 'Họp nhóm kỹ thuật', 'Training bảo mật',
  'Họp marketing Q4', 'Brainstorm chiến dịch', 'Kick-off dự án Beta',
];
const organizers = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em', 'Vũ Đức Phong'];
const hours = ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30'];

export const bookings: Booking[] = Array.from({ length: 25 }, (_, i) => {
  const room = rooms[i % rooms.length];
  const startIdx = i % hours.length;
  const startH = parseInt(hours[startIdx]);
  const endH = startH + 1 + (i % 2);
  return {
    id: `BK${String(i + 1).padStart(3, '0')}`,
    roomId: room.id,
    roomName: room.name,
    title: bookingTitles[i % bookingTitles.length],
    organizer: organizers[i % organizers.length],
    date: `2025-02-${String(17 + (i % 7)).padStart(2, '0')}`,
    startTime: hours[startIdx],
    endTime: `${String(endH).padStart(2, '0')}:${hours[startIdx].split(':')[1]}`,
    attendees: 2 + (i % (room.capacity - 1)),
    status: i === 3 ? 'cancelled' : i % 4 === 0 ? 'pending' : 'confirmed',
  };
});

export const summary = {
  totalRooms: rooms.length,
  available: rooms.filter(r => r.status === 'available').length,
  occupied: rooms.filter(r => r.status === 'occupied').length,
  todayBookings: 8,
};
