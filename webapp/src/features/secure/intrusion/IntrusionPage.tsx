import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { DataTable, type Column } from '@/components/common/DataTable';
import { cn } from '@/lib/utils';
import { mockZones, mockSensors, mockAlarmEvents } from './mock-data';
import type { Zone, Sensor, AlarmEvent, ZoneStatus, SensorStatus, AlarmSeverity, AlarmStatus } from './mock-data';

const zoneStatusConfig: Record<ZoneStatus, { label: string; bg: string; text: string }> = {
  armed: { label: 'Armed', bg: 'bg-[#22C55E]/15', text: 'text-[#22C55E]' },
  disarmed: { label: 'Disarmed', bg: 'bg-[#64748B]/15', text: 'text-[#94A3B8]' },
  alarm: { label: 'ALARM', bg: 'bg-[#EF4444]/15', text: 'text-[#EF4444]' },
};

const sensorStatusColor: Record<SensorStatus, string> = {
  normal: 'bg-[#22C55E]',
  triggered: 'bg-[#EF4444] animate-pulse',
  offline: 'bg-[#64748B]',
  tampered: 'bg-[#EAB308]',
};

const severityColor: Record<AlarmSeverity, string> = {
  critical: 'text-[#EF4444]',
  high: 'text-[#F59E0B]',
  medium: 'text-[#3B82F6]',
  low: 'text-[#94A3B8]',
};

const alarmStatusConfig: Record<AlarmStatus, { label: string; cls: string }> = {
  active: { label: 'Đang hoạt động', cls: 'text-[#EF4444]' },
  acknowledged: { label: 'Đã xác nhận', cls: 'text-[#F59E0B]' },
  resolved: { label: 'Đã xử lý', cls: 'text-[#22C55E]' },
};

function ZoneCard({ zone, selected, onClick }: { zone: Zone; selected: boolean; onClick: () => void }) {
  const [status, setStatus] = useState(zone.status);
  const cfg = zoneStatusConfig[status];

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStatus((s) => (s === 'alarm' ? 'armed' : s === 'armed' ? 'disarmed' : 'armed'));
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border bg-[#111827] cursor-pointer transition-all',
        selected ? 'border-[#3B82F6]' : 'border-[#1E293B] hover:border-[#334155]',
        status === 'alarm' && 'border-[#EF4444]/50'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium text-[#F8FAFC]">{zone.name}</span>
        <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', cfg.bg, cfg.text)}>{cfg.label}</span>
      </div>
      <div className="text-[11px] text-[#64748B] mb-3">{zone.floor} · {zone.sensorCount} cảm biến</div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#475569]">Sự kiện cuối: {zone.lastEvent}</span>
        <button
          onClick={toggle}
          className={cn(
            'px-2.5 py-1 rounded text-[11px] font-medium border transition-colors',
            status === 'armed'
              ? 'bg-[#22C55E]/10 border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/20'
              : status === 'alarm'
                ? 'bg-[#EF4444]/10 border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/20'
                : 'bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]'
          )}
        >
          {status === 'armed' ? 'Disarm' : 'Arm'}
        </button>
      </div>
    </div>
  );
}

function SensorList({ sensors }: { sensors: Sensor[] }) {
  if (!sensors.length) return <div className="text-[13px] text-[#64748B] p-4">Chọn zone để xem cảm biến</div>;
  return (
    <div className="space-y-1.5">
      {sensors.map((s) => (
        <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-[#111827] rounded-lg border border-[#1E293B]">
          <span className={cn('w-2 h-2 rounded-full shrink-0', sensorStatusColor[s.status])} />
          <div className="flex-1 min-w-0">
            <div className="text-[12px] font-medium text-[#F8FAFC]">{s.name} <span className="text-[#64748B]">({s.type})</span></div>
            <div className="text-[11px] text-[#64748B]">{s.location}</div>
          </div>
          <div className="text-[11px] text-[#64748B]">{s.battery}%</div>
        </div>
      ))}
    </div>
  );
}

const alarmColumns: Column<AlarmEvent>[] = [
  { key: 'time', header: 'Thời gian', width: '140px', sortable: true },
  { key: 'zone', header: 'Zone', sortable: true },
  { key: 'type', header: 'Loại', sortable: true },
  {
    key: 'severity', header: 'Mức độ', sortable: true,
    render: (r) => <span className={cn('font-medium capitalize', severityColor[r.severity])}>{r.severity}</span>,
  },
  {
    key: 'status', header: 'Trạng thái',
    render: (r) => <span className={alarmStatusConfig[r.status].cls}>{alarmStatusConfig[r.status].label}</span>,
  },
  { key: 'description', header: 'Mô tả' },
];

export function IntrusionPage() {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const zoneSensors = selectedZone ? mockSensors.filter((s) => s.zoneId === selectedZone) : [];

  const armed = mockZones.filter((z) => z.status === 'armed').length;
  const alarmCount = mockZones.filter((z) => z.status === 'alarm').length;
  const offlineSensors = mockSensors.filter((s) => s.status === 'offline' || s.status === 'tampered').length;

  return (
    <div>
      <PageHeader title="Intrusion Detection" description="Quản lý hệ thống phát hiện xâm nhập" />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Tổng zone" value={String(mockZones.length)} sub={`${armed} armed`} icon="🛡️" domain="secure" />
        <StatCard label="Cảnh báo" value={String(alarmCount)} sub="Zone đang báo động" icon="🚨" domain="error" />
        <StatCard label="Cảm biến" value={String(mockSensors.length)} sub={`${offlineSensors} lỗi`} icon="📡" domain="default" />
        <StatCard label="Sự kiện hôm nay" value={String(mockAlarmEvents.filter((e) => e.time.startsWith('2026-02-19')).length)} sub="Trong 24h qua" icon="📋" domain="secure" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Zone list */}
        <div className="col-span-2">
          <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Danh sách Zone</h2>
          <div className="grid grid-cols-2 gap-3">
            {mockZones.map((z) => (
              <ZoneCard key={z.id} zone={z} selected={selectedZone === z.id} onClick={() => setSelectedZone(z.id)} />
            ))}
          </div>
        </div>

        {/* Right side: sensors + map */}
        <div className="space-y-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">
              Cảm biến {selectedZone ? `- ${mockZones.find((z) => z.id === selectedZone)?.name}` : ''}
            </h2>
            <SensorList sensors={zoneSensors} />
          </div>
          {/* Floor plan placeholder */}
          <div className="aspect-[4/3] bg-[#0D1117] border border-[#1E293B] rounded-lg flex items-center justify-center">
            <div className="text-center">
              <svg className="w-8 h-8 text-[#334155] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
              </svg>
              <span className="text-[13px] text-[#475569] font-medium">Floor Plan</span>
            </div>
          </div>
        </div>
      </div>

      {/* Alarm history */}
      <div>
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Lịch sử cảnh báo</h2>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
          <DataTable columns={alarmColumns} data={mockAlarmEvents} rowKey={(r) => r.id} />
        </div>
      </div>
    </div>
  );
}
