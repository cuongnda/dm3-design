export interface Sensor {
  id: string;
  name: string;
  type: 'temperature' | 'humidity' | 'power' | 'water' | 'air-quality' | 'light';
  location: string;
  value: number;
  unit: string;
  status: 'normal' | 'warning' | 'critical' | 'offline';
  lastUpdated: string;
}

export interface EnergyData {
  month: string;
  electricity: number;
  water: number;
  gas: number;
}

export interface Alert {
  id: string;
  sensorId: string;
  sensorName: string;
  type: 'warning' | 'critical';
  message: string;
  time: string;
  acknowledged: boolean;
}

const sensorTypes: { type: Sensor['type']; unit: string; range: [number, number] }[] = [
  { type: 'temperature', unit: '°C', range: [18, 35] },
  { type: 'humidity', unit: '%', range: [30, 80] },
  { type: 'power', unit: 'kW', range: [0, 50] },
  { type: 'water', unit: 'L/h', range: [0, 200] },
  { type: 'air-quality', unit: 'AQI', range: [20, 150] },
  { type: 'light', unit: 'lux', range: [100, 800] },
];
const locations = ['Tầng 1 - Sảnh', 'Tầng 2 - VP', 'Tầng 3 - VP', 'Tầng hầm B1', 'Tầng 4 - Canteen', 'Sân thượng'];

export const sensors: Sensor[] = Array.from({ length: 30 }, (_, i) => {
  const st = sensorTypes[i % sensorTypes.length];
  const val = +(st.range[0] + Math.random() * (st.range[1] - st.range[0])).toFixed(1);
  return {
    id: `S${String(i + 1).padStart(3, '0')}`,
    name: `${st.type === 'temperature' ? 'Nhiệt độ' : st.type === 'humidity' ? 'Độ ẩm' : st.type === 'power' ? 'Công suất' : st.type === 'water' ? 'Lưu lượng nước' : st.type === 'air-quality' ? 'Chất lượng KK' : 'Ánh sáng'} ${locations[i % locations.length]}`,
    type: st.type,
    location: locations[i % locations.length],
    value: val,
    unit: st.unit,
    status: i === 2 ? 'critical' : i === 7 || i === 15 ? 'warning' : i === 29 ? 'offline' : 'normal',
    lastUpdated: `07:${String((i * 3) % 60).padStart(2, '0')}`,
  };
});

export const energyData: EnergyData[] = [
  { month: 'T9', electricity: 42000, water: 1200, gas: 800 },
  { month: 'T10', electricity: 45000, water: 1350, gas: 750 },
  { month: 'T11', electricity: 38000, water: 1100, gas: 900 },
  { month: 'T12', electricity: 50000, water: 1400, gas: 850 },
  { month: 'T1', electricity: 47000, water: 1250, gas: 780 },
  { month: 'T2', electricity: 43000, water: 1180, gas: 820 },
];

export const alerts: Alert[] = [
  { id: 'AL01', sensorId: 'S003', sensorName: 'Công suất Tầng 3 - VP', type: 'critical', message: 'Công suất vượt ngưỡng 45kW', time: '07:15', acknowledged: false },
  { id: 'AL02', sensorId: 'S008', sensorName: 'Độ ẩm Tầng 2 - VP', type: 'warning', message: 'Độ ẩm cao bất thường 78%', time: '06:45', acknowledged: true },
  { id: 'AL03', sensorId: 'S016', sensorName: 'Chất lượng KK Tầng 4', type: 'warning', message: 'AQI vượt mức trung bình', time: '06:30', acknowledged: false },
  { id: 'AL04', sensorId: 'S030', sensorName: 'Ánh sáng Sân thượng', type: 'warning', message: 'Cảm biến mất kết nối', time: '05:00', acknowledged: true },
];

export const summary = {
  totalSensors: sensors.length,
  online: sensors.filter(s => s.status !== 'offline').length,
  warnings: sensors.filter(s => s.status === 'warning').length,
  critical: sensors.filter(s => s.status === 'critical').length,
  monthlyElectricity: '43,000 kWh',
  monthlyCost: '215 triệu VNĐ',
};
