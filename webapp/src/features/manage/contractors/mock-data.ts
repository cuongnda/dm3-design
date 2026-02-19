export interface Company {
  id: string;
  name: string;
  activeWorkers: number;
  totalWorkers: number;
  compliance: number;
  contractStart: string;
  contractEnd: string;
  workers: Worker[];
}

export interface Worker {
  id: string;
  name: string;
  companyId: string;
  role: string;
  safetyTraining: boolean;
  insurance: boolean;
  badge: boolean;
  badgeExpiry?: string;
  checkedIn: boolean;
  checkInTime?: string;
}

const workerNames = [
  'Trần Đức Anh', 'Lê Thị Bảo', 'Phạm Văn Cảnh', 'Hoàng Thị Dung', 'Vũ Minh Đạo',
  'Đặng Văn Hiếu', 'Bùi Thị Hoa', 'Ngô Văn Khánh', 'Đỗ Thị Lệ', 'Trịnh Văn Minh',
  'Lý Thị Nga', 'Phan Văn Phú', 'Dương Thị Quỳnh', 'Hà Văn Sơn', 'Mai Thị Tâm',
  'Tô Văn Uy', 'Võ Thị Vân', 'Châu Văn Xuân', 'Lưu Thị Yến', 'Nguyễn Văn Bắc',
  'Trần Thị Cúc', 'Lê Văn Dũng', 'Phạm Thị Hạnh', 'Hoàng Văn Lộc', 'Vũ Thị Nhung',
];

const companyData = [
  { name: 'Công ty TNHH Điện lạnh Đại Việt', workers: 7 },
  { name: 'Công ty CP Xây dựng Hoàng Phát', workers: 6 },
  { name: 'Công ty TNHH Vệ sinh Sạch Xanh', workers: 5 },
  { name: 'Công ty CP Bảo trì Thắng Lợi', workers: 4 },
  { name: 'Công ty TNHH An ninh Việt Phát', workers: 3 },
];

let wi = 0;
export const mockCompanies: Company[] = companyData.map((c, ci) => {
  const workers: Worker[] = Array.from({ length: c.workers }, (_, j) => {
    const idx = wi++;
    const expiringSoon = idx === 3 || idx === 10;
    const expired = idx === 18;
    return {
      id: `W${String(idx + 1).padStart(3, '0')}`,
      name: workerNames[idx],
      companyId: `C${ci + 1}`,
      role: j === 0 ? 'Đội trưởng' : 'Công nhân',
      safetyTraining: idx !== 20,
      insurance: idx !== 15,
      badge: true,
      badgeExpiry: expired ? '2026-01-15' : expiringSoon ? '2026-02-25' : '2026-12-31',
      checkedIn: idx % 3 !== 2,
      checkInTime: idx % 3 !== 2 ? `${String(7 + Math.floor(idx / 5)).padStart(2, '0')}:${String((idx * 13) % 60).padStart(2, '0')}` : undefined,
    };
  });
  const compliant = workers.filter(w => w.safetyTraining && w.insurance && w.badge).length;
  return {
    id: `C${ci + 1}`,
    name: c.name,
    activeWorkers: workers.filter(w => w.checkedIn).length,
    totalWorkers: c.workers,
    compliance: Math.round((compliant / c.workers) * 100),
    contractStart: '2025-06-01',
    contractEnd: ci === 3 ? '2026-03-01' : '2026-12-31',
    workers,
  };
});
