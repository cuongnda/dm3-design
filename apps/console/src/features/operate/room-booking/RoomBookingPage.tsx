import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { rooms, bookings, summary, type Booking } from './mock-data';

const statusCfg: Record<string, { color: string; label: string }> = {
  confirmed: { color: '#22C55E', label: 'Đã xác nhận' },
  pending: { color: '#EAB308', label: 'Chờ duyệt' },
  cancelled: { color: '#EF4444', label: 'Đã hủy' },
};

const roomStatusCfg: Record<string, { color: string; label: string }> = {
  available: { color: '#22C55E', label: 'Trống' },
  occupied: { color: '#F59E0B', label: 'Đang dùng' },
  maintenance: { color: '#EF4444', label: 'Bảo trì' },
};

export function RoomBookingPage() {
  const [tab, setTab] = useState<'bookings' | 'rooms'>('bookings');

  const bookingCols: Column<Booking>[] = [
    { key: 'roomName', header: 'Phòng', sortable: true, render: r => <span className="font-medium text-[#F8FAFC]">{r.roomName}</span> },
    { key: 'title', header: 'Tiêu đề', sortable: true, render: r => <span className="text-[#94A3B8]">{r.title}</span> },
    { key: 'organizer', header: 'Người đặt', sortable: true },
    { key: 'date', header: 'Ngày', width: '100px', sortable: true },
    { key: 'startTime', header: 'Bắt đầu', width: '80px' },
    { key: 'endTime', header: 'Kết thúc', width: '80px' },
    { key: 'attendees', header: 'Số người', width: '80px' },
    { key: 'status', header: 'Trạng thái', width: '110px', render: r => {
      const c = statusCfg[r.status];
      return <span className="text-[12px] font-medium" style={{ color: c.color }}>{c.label}</span>;
    }},
  ];

  return (
    <div>
      <PageHeader title="Đặt phòng họp" description="Quản lý đặt phòng và lịch sử dụng">
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">+ Đặt phòng</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Tổng phòng" value={String(summary.totalRooms)} sub="Tất cả tầng" icon="🏢" domain="operate" />
        <StatCard label="Phòng trống" value={String(summary.available)} sub="Sẵn sàng" icon="✅" domain="operate" />
        <StatCard label="Đang sử dụng" value={String(summary.occupied)} sub="Hiện tại" icon="🔒" domain="operate" />
        <StatCard label="Đặt phòng hôm nay" value={String(summary.todayBookings)} sub="Cuộc họp" icon="📅" domain="operate" />
      </div>

      {/* Room availability grid */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 mb-6">
        <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Trạng thái phòng</h3>
        <div className="grid grid-cols-5 gap-2">
          {rooms.map(room => {
            const st = roomStatusCfg[room.status];
            return (
              <div key={room.id} className="bg-[#111827] border border-[#334155] rounded-md p-3">
                <div className="text-[13px] font-medium text-[#F8FAFC] mb-1">{room.name}</div>
                <div className="text-[11px] text-[#64748B] mb-2">Tầng {room.floor} · {room.capacity} người</div>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: st.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.color }} />
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['bookings', 'rooms'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            'px-3 py-1.5 rounded-md text-[12px] font-medium border',
            tab === t ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
          )}>
            {t === 'bookings' ? '📋 Lịch đặt phòng' : '🏢 Danh sách phòng'}
          </button>
        ))}
      </div>

      <DataTable columns={bookingCols} data={bookings} rowKey={r => r.id} />
    </div>
  );
}
