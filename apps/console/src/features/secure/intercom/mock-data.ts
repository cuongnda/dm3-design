export type DeviceType = 'door-station' | 'indoor-monitor';
export type DeviceStatus = 'online' | 'offline' | 'busy';
export type CallResult = 'answered' | 'missed' | 'rejected' | 'busy';

export interface IntercomDevice {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  location: string;
  ip: string;
  firmware: string;
  lastSeen: string;
}

export interface CallRecord {
  id: string;
  time: string;
  caller: string;
  receiver: string;
  duration: string;
  result: CallResult;
}

export const mockDevices: IntercomDevice[] = [
  { id: 'd1', name: 'DS-Cổng chính', type: 'door-station', status: 'online', location: 'Cổng chính', ip: '192.168.1.101', firmware: 'v3.2.1', lastSeen: '2026-02-19 07:00' },
  { id: 'd2', name: 'DS-Cổng phụ', type: 'door-station', status: 'online', location: 'Cổng phụ phía Bắc', ip: '192.168.1.102', firmware: 'v3.2.1', lastSeen: '2026-02-19 07:00' },
  { id: 'd3', name: 'DS-Sảnh Tầng 1', type: 'door-station', status: 'online', location: 'Sảnh tiếp tân', ip: '192.168.1.103', firmware: 'v3.2.0', lastSeen: '2026-02-19 06:58' },
  { id: 'd4', name: 'DS-Tầng hầm B2', type: 'door-station', status: 'offline', location: 'Lối vào tầng hầm', ip: '192.168.1.104', firmware: 'v3.1.5', lastSeen: '2026-02-18 22:30' },
  { id: 'd5', name: 'MN-Bảo vệ', type: 'indoor-monitor', status: 'online', location: 'Phòng bảo vệ', ip: '192.168.1.201', firmware: 'v2.4.0', lastSeen: '2026-02-19 07:00' },
  { id: 'd6', name: 'MN-Lễ tân', type: 'indoor-monitor', status: 'online', location: 'Quầy lễ tân', ip: '192.168.1.202', firmware: 'v2.4.0', lastSeen: '2026-02-19 07:00' },
  { id: 'd7', name: 'MN-Quản lý T5', type: 'indoor-monitor', status: 'busy', location: 'VP Quản lý Tầng 5', ip: '192.168.1.203', firmware: 'v2.4.0', lastSeen: '2026-02-19 06:59' },
  { id: 'd8', name: 'MN-Kỹ thuật', type: 'indoor-monitor', status: 'online', location: 'Phòng kỹ thuật', ip: '192.168.1.204', firmware: 'v2.3.8', lastSeen: '2026-02-19 06:55' },
];

export const mockCallRecords: CallRecord[] = [
  { id: 'c1', time: '2026-02-19 06:58', caller: 'DS-Cổng chính', receiver: 'MN-Bảo vệ', duration: '0:45', result: 'answered' },
  { id: 'c2', time: '2026-02-19 06:45', caller: 'DS-Cổng phụ', receiver: 'MN-Lễ tân', duration: '1:20', result: 'answered' },
  { id: 'c3', time: '2026-02-19 06:30', caller: 'DS-Sảnh Tầng 1', receiver: 'MN-Quản lý T5', duration: '-', result: 'missed' },
  { id: 'c4', time: '2026-02-19 06:15', caller: 'DS-Cổng chính', receiver: 'MN-Bảo vệ', duration: '0:30', result: 'answered' },
  { id: 'c5', time: '2026-02-19 05:50', caller: 'DS-Cổng chính', receiver: 'MN-Lễ tân', duration: '-', result: 'rejected' },
  { id: 'c6', time: '2026-02-19 05:30', caller: 'DS-Tầng hầm B2', receiver: 'MN-Bảo vệ', duration: '2:10', result: 'answered' },
  { id: 'c7', time: '2026-02-19 04:00', caller: 'DS-Cổng chính', receiver: 'MN-Bảo vệ', duration: '0:15', result: 'answered' },
  { id: 'c8', time: '2026-02-19 03:20', caller: 'DS-Cổng phụ', receiver: 'MN-Bảo vệ', duration: '-', result: 'missed' },
  { id: 'c9', time: '2026-02-18 23:00', caller: 'DS-Cổng chính', receiver: 'MN-Bảo vệ', duration: '0:55', result: 'answered' },
  { id: 'c10', time: '2026-02-18 22:30', caller: 'DS-Sảnh Tầng 1', receiver: 'MN-Kỹ thuật', duration: '1:05', result: 'answered' },
  { id: 'c11', time: '2026-02-18 21:15', caller: 'DS-Cổng chính', receiver: 'MN-Bảo vệ', duration: '0:20', result: 'answered' },
  { id: 'c12', time: '2026-02-18 20:00', caller: 'DS-Cổng phụ', receiver: 'MN-Quản lý T5', duration: '-', result: 'missed' },
  { id: 'c13', time: '2026-02-18 18:30', caller: 'DS-Cổng chính', receiver: 'MN-Lễ tân', duration: '0:40', result: 'answered' },
  { id: 'c14', time: '2026-02-18 17:00', caller: 'DS-Sảnh Tầng 1', receiver: 'MN-Bảo vệ', duration: '-', result: 'busy' },
  { id: 'c15', time: '2026-02-18 16:00', caller: 'DS-Tầng hầm B2', receiver: 'MN-Kỹ thuật', duration: '3:00', result: 'answered' },
  { id: 'c16', time: '2026-02-18 14:30', caller: 'DS-Cổng chính', receiver: 'MN-Lễ tân', duration: '1:15', result: 'answered' },
  { id: 'c17', time: '2026-02-18 13:00', caller: 'DS-Cổng phụ', receiver: 'MN-Bảo vệ', duration: '0:25', result: 'answered' },
  { id: 'c18', time: '2026-02-18 11:30', caller: 'DS-Sảnh Tầng 1', receiver: 'MN-Quản lý T5', duration: '2:30', result: 'answered' },
  { id: 'c19', time: '2026-02-18 10:00', caller: 'DS-Cổng chính', receiver: 'MN-Bảo vệ', duration: '-', result: 'missed' },
  { id: 'c20', time: '2026-02-18 08:30', caller: 'DS-Cổng chính', receiver: 'MN-Lễ tân', duration: '0:50', result: 'answered' },
];
