export interface ParkingSpot {
  id: string;
  level: string;
  spot: string;
  status: 'occupied' | 'available' | 'reserved';
  licensePlate?: string;
  ownerName?: string;
  entryTime?: string;
}

export interface ParkingLog {
  id: string;
  licensePlate: string;
  ownerName: string;
  vehicleType: 'Ô tô' | 'Xe máy';
  action: 'entry' | 'exit';
  time: string;
  spot: string;
  level: string;
}

const levels = ['B1', 'B2', 'B3'];
const spotsPerLevel = [80, 70, 50];
const names = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em', 'Vũ Đức Phong', 'Đặng Thị Giang', 'Bùi Quốc Huy'];
const plates = ['51A-123.45', '30H-567.89', '51G-234.56', '29B-876.54', '51F-345.67', '30K-654.32', '51D-456.78', '29A-987.65', '51C-567.89', '30E-432.10'];

export const parkingSpots: ParkingSpot[] = [];
levels.forEach((level, li) => {
  for (let i = 1; i <= spotsPerLevel[li]; i++) {
    const spotId = `${level}-${String(i).padStart(3, '0')}`;
    const occupied = Math.random() > 0.35;
    const reserved = !occupied && Math.random() > 0.8;
    parkingSpots.push({
      id: spotId,
      level,
      spot: String(i).padStart(3, '0'),
      status: occupied ? 'occupied' : reserved ? 'reserved' : 'available',
      licensePlate: occupied ? plates[i % plates.length] : undefined,
      ownerName: occupied ? names[i % names.length] : undefined,
      entryTime: occupied ? `${String(6 + (i % 4)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}` : undefined,
    });
  }
});

export const parkingLogs: ParkingLog[] = Array.from({ length: 30 }, (_, i) => ({
  id: `PL${String(i + 1).padStart(3, '0')}`,
  licensePlate: plates[i % plates.length],
  ownerName: names[i % names.length],
  vehicleType: i % 3 === 0 ? 'Xe máy' : 'Ô tô',
  action: i % 2 === 0 ? 'entry' : 'exit',
  time: `${String(6 + (i % 12)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`,
  spot: `${levels[i % 3]}-${String(1 + (i * 3) % 50).padStart(3, '0')}`,
  level: levels[i % 3],
}));

export const summary = {
  total: parkingSpots.length,
  occupied: parkingSpots.filter(s => s.status === 'occupied').length,
  available: parkingSpots.filter(s => s.status === 'available').length,
  reserved: parkingSpots.filter(s => s.status === 'reserved').length,
};
