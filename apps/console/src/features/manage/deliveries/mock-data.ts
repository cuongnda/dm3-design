export interface Delivery {
  id: string;
  packageId: string;
  recipient: string;
  sender: string;
  courier: string;
  status: 'pending' | 'collected' | 'returned';
  receivedTime: string;
  receivedDate: string;
  collectedTime?: string;
  hasPhoto: boolean;
}

const recipients = ['Nguyễn Văn An', 'Trần Thị Bích', 'Lê Hoàng Cường', 'Phạm Minh Đức', 'Hoàng Thị Em', 'Vũ Đức Phong', 'Đặng Thị Giang', 'Bùi Quốc Huy'];
const senders = ['Amazon VN', 'Shopee Express', 'Lazada', 'Tiki', 'GHN', 'J&T Express', 'Viettel Post', 'GHTK'];
const couriers = ['GHN', 'J&T Express', 'Viettel Post', 'GHTK', 'Grab Express'];

export const mockDeliveries: Delivery[] = Array.from({ length: 15 }, (_, i) => {
  const isOld = i === 2 || i === 7; // >24h uncollected
  const status: Delivery['status'] = i < 6 ? 'pending' : i < 13 ? 'collected' : 'returned';
  return {
    id: `D${String(i + 1).padStart(3, '0')}`,
    packageId: `PKG-${String(2024000 + i * 37)}`,
    recipient: recipients[i % recipients.length],
    sender: senders[i % senders.length],
    courier: couriers[i % couriers.length],
    status,
    receivedTime: `${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}`,
    receivedDate: isOld ? '2026-02-17' : '2026-02-19',
    collectedTime: status === 'collected' ? `${String(10 + Math.floor(i / 3)).padStart(2, '0')}:${String((i * 23) % 60).padStart(2, '0')}` : undefined,
    hasPhoto: i % 3 !== 2,
  };
});
