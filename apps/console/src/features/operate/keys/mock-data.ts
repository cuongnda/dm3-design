export interface Key {
  id: string;
  name: string;
  type: 'master' | 'room' | 'cabinet' | 'gate';
  location: string;
  status: 'available' | 'checked-out' | 'overdue' | 'lost';
  checkedOutBy?: string;
  checkedOutAt?: string;
  dueBack?: string;
}

export interface KeyLog {
  id: string;
  keyId: string;
  keyName: string;
  action: 'checkout' | 'return';
  person: string;
  time: string;
  date: string;
  notes?: string;
}

const keyTypes: Key['type'][] = ['master', 'room', 'cabinet', 'gate'];
const keyLocations = ['Tầng 1', 'Tầng 2', 'Tầng 3', 'Tầng hầm', 'Sân thượng'];
const persons = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em', 'Vũ Đức Phong', 'Đặng Thị Giang', 'Bùi Quốc Huy'];

export const keys: Key[] = Array.from({ length: 50 }, (_, i) => {
  const isOut = i < 15;
  const isOverdue = isOut && i < 3;
  const isLost = i === 49;
  return {
    id: `K${String(i + 1).padStart(3, '0')}`,
    name: i < 5 ? `Chìa khóa master ${i + 1}` : i < 20 ? `Phòng ${100 + i}` : i < 35 ? `Tủ ${String.fromCharCode(65 + (i % 10))}${i}` : `Cổng ${i - 34}`,
    type: keyTypes[i < 5 ? 0 : i < 20 ? 1 : i < 35 ? 2 : 3],
    location: keyLocations[i % keyLocations.length],
    status: isLost ? 'lost' : isOverdue ? 'overdue' : isOut ? 'checked-out' : 'available',
    checkedOutBy: isOut || isLost ? persons[i % persons.length] : undefined,
    checkedOutAt: isOut || isLost ? `${String(7 + (i % 5)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}` : undefined,
    dueBack: isOut ? `${String(16 + (i % 3)).padStart(2, '0')}:00` : undefined,
  };
});

export const keyLogs: KeyLog[] = Array.from({ length: 30 }, (_, i) => ({
  id: `KL${String(i + 1).padStart(3, '0')}`,
  keyId: keys[i % keys.length].id,
  keyName: keys[i % keys.length].name,
  action: i % 2 === 0 ? 'checkout' : 'return',
  person: persons[i % persons.length],
  time: `${String(7 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}`,
  date: `2025-02-${String(17 - Math.floor(i / 10)).padStart(2, '0')}`,
  notes: i % 5 === 0 ? 'Bảo trì' : undefined,
}));

export const summary = {
  total: keys.length,
  available: keys.filter(k => k.status === 'available').length,
  checkedOut: keys.filter(k => k.status === 'checked-out').length,
  overdue: keys.filter(k => k.status === 'overdue').length,
  lost: keys.filter(k => k.status === 'lost').length,
};
