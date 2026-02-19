export interface PatrolRoute {
  id: string;
  name: string;
  checkpoints: number;
  frequency: string;
  assignedGuard: string;
  status: 'active' | 'completed' | 'missed' | 'in-progress';
  lastCompleted?: string;
  nextDue: string;
}

export interface Checkpoint {
  id: string;
  routeId: string;
  name: string;
  location: string;
  order: number;
  scannedAt?: string;
  status: 'scanned' | 'pending' | 'missed';
}

export interface TourLog {
  id: string;
  routeName: string;
  guardName: string;
  startTime: string;
  endTime?: string;
  checkpointsTotal: number;
  checkpointsScanned: number;
  status: 'completed' | 'in-progress' | 'incomplete';
  date: string;
}

export const routes: PatrolRoute[] = [
  { id: 'PR01', name: 'Tuần tra ngoại vi', checkpoints: 8, frequency: 'Mỗi 2 giờ', assignedGuard: 'Nguyễn Văn Bảo', status: 'active', lastCompleted: '06:30', nextDue: '08:30' },
  { id: 'PR02', name: 'Tuần tra tầng hầm', checkpoints: 6, frequency: 'Mỗi 3 giờ', assignedGuard: 'Trần Đức Mạnh', status: 'in-progress', lastCompleted: '05:00', nextDue: '08:00' },
  { id: 'PR03', name: 'Tuần tra tầng 1-3', checkpoints: 10, frequency: 'Mỗi 2 giờ', assignedGuard: 'Lê Thanh Hải', status: 'completed', lastCompleted: '07:00', nextDue: '09:00' },
  { id: 'PR04', name: 'Tuần tra ban đêm', checkpoints: 12, frequency: 'Mỗi giờ', assignedGuard: 'Phạm Quốc Bảo', status: 'missed', lastCompleted: '03:00', nextDue: '04:00' },
  { id: 'PR05', name: 'Tuần tra sân thượng', checkpoints: 5, frequency: 'Mỗi 4 giờ', assignedGuard: 'Hoàng Minh Tuấn', status: 'active', lastCompleted: '04:00', nextDue: '08:00' },
];

const checkpointNames = [
  'Cổng chính', 'Cổng phụ', 'Sảnh chính', 'Hành lang T1', 'Cầu thang B', 'Phòng kỹ thuật',
  'Tầng hầm B1', 'Tầng hầm B2', 'Bãi xe ngoài', 'Khu vực rác', 'Sân thượng', 'Phòng máy chủ',
];

export const checkpoints: Checkpoint[] = checkpointNames.map((name, i) => ({
  id: `CP${String(i + 1).padStart(3, '0')}`,
  routeId: routes[i % routes.length].id,
  name,
  location: `Khu vực ${String.fromCharCode(65 + (i % 6))}`,
  order: (i % 8) + 1,
  scannedAt: i < 7 ? `07:${String(i * 5 + 10).padStart(2, '0')}` : undefined,
  status: i < 7 ? 'scanned' : i < 10 ? 'pending' : 'missed',
}));

export const tourLogs: TourLog[] = Array.from({ length: 15 }, (_, i) => ({
  id: `TL${String(i + 1).padStart(3, '0')}`,
  routeName: routes[i % routes.length].name,
  guardName: routes[i % routes.length].assignedGuard,
  startTime: `${String(i * 2 % 24).padStart(2, '0')}:00`,
  endTime: i < 12 ? `${String(i * 2 % 24).padStart(2, '0')}:${String(25 + i * 3).padStart(2, '0')}` : undefined,
  checkpointsTotal: routes[i % routes.length].checkpoints,
  checkpointsScanned: i < 12 ? routes[i % routes.length].checkpoints - (i % 3) : Math.floor(routes[i % routes.length].checkpoints / 2),
  status: i < 10 ? 'completed' : i < 12 ? 'in-progress' : 'incomplete',
  date: `2025-02-${String(17 - Math.floor(i / 5)).padStart(2, '0')}`,
}));

export const summary = {
  totalRoutes: routes.length,
  activeNow: routes.filter(r => r.status === 'active' || r.status === 'in-progress').length,
  missedToday: 1,
  totalCheckpoints: checkpoints.length,
};
