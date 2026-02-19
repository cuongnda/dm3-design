import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/common/DataTable';
import { cn } from '@/lib/utils';
import { parkingSpots, parkingLogs, summary, type ParkingLog } from './mock-data';

const levels = ['B1', 'B2', 'B3'];

export function ParkingPage() {
  const [selectedLevel, setSelectedLevel] = useState('B1');

  const spotsForLevel = parkingSpots.filter(s => s.level === selectedLevel);
  const occupancyPct = Math.round(summary.occupied / summary.total * 100);

  const logCols: Column<ParkingLog>[] = [
    { key: 'time', header: 'Thời gian', width: '80px', sortable: true, render: r => <span className="font-mono text-[12px] text-[#94A3B8]">{r.time}</span> },
    { key: 'licensePlate', header: 'Biển số', sortable: true, render: r => <span className="font-mono font-medium text-[#F8FAFC]">{r.licensePlate}</span> },
    { key: 'ownerName', header: 'Chủ xe', sortable: true },
    { key: 'vehicleType', header: 'Loại xe', width: '80px' },
    { key: 'action', header: 'Hành động', width: '80px', render: r => (
      <span className={cn('text-[12px] font-medium', r.action === 'entry' ? 'text-[#22C55E]' : 'text-[#F59E0B]')}>
        {r.action === 'entry' ? '⬇ Vào' : '⬆ Ra'}
      </span>
    )},
    { key: 'spot', header: 'Vị trí', width: '90px' },
  ];

  return (
    <div>
      <PageHeader title="Bãi đỗ xe" description="Quản lý bãi đỗ xe và theo dõi xe ra vào">
        <button className="px-3 py-1.5 bg-[#F59E0B] text-[#0F172A] rounded-md text-[12px] font-medium">📊 Báo cáo</button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Tổng chỗ đỗ" value={String(summary.total)} sub="3 tầng hầm" icon="🅿️" domain="operate" />
        <StatCard label="Đang đỗ" value={String(summary.occupied)} sub={`${occupancyPct}% công suất`} icon="🚗" domain="operate" />
        <StatCard label="Còn trống" value={String(summary.available)} sub="Sẵn sàng" icon="✅" domain="operate" />
        <StatCard label="Đã đặt trước" value={String(summary.reserved)} sub="Chỗ riêng" icon="🔒" domain="operate" />
      </div>

      {/* Parking grid */}
      <div className="bg-[#1E293B] border border-[#334155] rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-medium text-[#F8FAFC]">Sơ đồ bãi đỗ</h3>
          <div className="flex gap-1">
            {levels.map(l => (
              <button key={l} onClick={() => setSelectedLevel(l)} className={cn(
                'px-3 py-1 rounded text-[12px] font-medium border',
                selectedLevel === l ? 'bg-[#F59E0B]/20 border-[#F59E0B]/50 text-[#F59E0B]' : 'bg-[#111827] border-[#334155] text-[#94A3B8]'
              )}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {spotsForLevel.slice(0, 50).map(spot => (
            <div key={spot.id} className={cn(
              'h-8 rounded text-[9px] flex items-center justify-center font-mono border',
              spot.status === 'occupied' ? 'bg-[#F59E0B]/20 border-[#F59E0B]/40 text-[#F59E0B]' :
              spot.status === 'reserved' ? 'bg-[#3B82F6]/20 border-[#3B82F6]/40 text-[#3B82F6]' :
              'bg-[#111827] border-[#334155] text-[#64748B]'
            )} title={spot.licensePlate || 'Trống'}>
              {spot.spot}
            </div>
          ))}
        </div>
        <div className="flex gap-4 mt-3">
          {[
            { color: '#F59E0B', label: 'Đang đỗ' },
            { color: '#3B82F6', label: 'Đặt trước' },
            { color: '#64748B', label: 'Trống' },
          ].map(l => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
              <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: l.color + '33', border: `1px solid ${l.color}66` }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Nhật ký ra vào</h3>
      <DataTable columns={logCols} data={parkingLogs} rowKey={r => r.id} />
    </div>
  );
}
