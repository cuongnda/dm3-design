import { useState } from 'react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { mockDevices, mockCallRecords } from './mock-data';
import type { IntercomDevice, CallRecord, DeviceStatus, CallResult } from './mock-data';

const statusConfig: Record<DeviceStatus, { label: string; dot: string; text: string }> = {
  online: { label: 'Online', dot: 'bg-[#22C55E]', text: 'text-[#22C55E]' },
  offline: { label: 'Offline', dot: 'bg-[#64748B]', text: 'text-[#64748B]' },
  busy: { label: 'Busy', dot: 'bg-[#F59E0B] animate-pulse', text: 'text-[#F59E0B]' },
};

const resultConfig: Record<CallResult, { label: string; cls: string }> = {
  answered: { label: 'Đã trả lời', cls: 'text-[#22C55E]' },
  missed: { label: 'Nhỡ', cls: 'text-[#EF4444]' },
  rejected: { label: 'Từ chối', cls: 'text-[#F59E0B]' },
  busy: { label: 'Bận', cls: 'text-[#64748B]' },
};

const callColumns: Column<CallRecord>[] = [
  { key: 'time', header: 'Thời gian', width: '140px', sortable: true },
  { key: 'caller', header: 'Gọi từ', sortable: true },
  { key: 'receiver', header: 'Nhận', sortable: true },
  { key: 'duration', header: 'Thời lượng', width: '100px' },
  {
    key: 'result', header: 'Kết quả',
    render: (r) => <span className={resultConfig[r.result].cls}>{resultConfig[r.result].label}</span>,
  },
];

function DeviceCard({ device, selected, onClick }: { device: IntercomDevice; selected: boolean; onClick: () => void }) {
  const sc = statusConfig[device.status];
  const isDoor = device.type === 'door-station';
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-lg border bg-[#111827] cursor-pointer transition-all',
        selected ? 'border-[#3B82F6]' : 'border-[#1E293B] hover:border-[#334155]'
      )}
    >
      <div className="flex items-center gap-3">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center text-[16px]', isDoor ? 'bg-[#3B82F6]/10' : 'bg-[#8B5CF6]/10')}>
          {isDoor ? '🚪' : '📺'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-[#F8FAFC] truncate">{device.name}</div>
          <div className="text-[11px] text-[#64748B] truncate">{device.location}</div>
        </div>
        <span className="inline-flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', sc.dot)} />
          <span className={cn('text-[11px]', sc.text)}>{sc.label}</span>
        </span>
      </div>
    </div>
  );
}

function ConfigPanel({ device }: { device: IntercomDevice | null }) {
  if (!device) return (
    <div className="p-6 text-center text-[13px] text-[#64748B]">Chọn thiết bị để xem cấu hình</div>
  );
  const fields = [
    { label: 'Tên', value: device.name },
    { label: 'Loại', value: device.type === 'door-station' ? 'Door Station' : 'Indoor Monitor' },
    { label: 'Vị trí', value: device.location },
    { label: 'IP', value: device.ip },
    { label: 'Firmware', value: device.firmware },
    { label: 'Lần cuối online', value: device.lastSeen },
  ];
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.label} className="flex items-center justify-between px-3 py-2 bg-[#0D1117] rounded border border-[#1E293B]">
          <span className="text-[11px] text-[#64748B] uppercase tracking-wide">{f.label}</span>
          <span className="text-[12px] text-[#F8FAFC] font-medium">{f.value}</span>
        </div>
      ))}
      <button className="w-full py-2 bg-[#3B82F6]/10 border border-[#3B82F6]/30 rounded-lg text-[12px] text-[#3B82F6] font-medium hover:bg-[#3B82F6]/20 transition-colors">
        Khởi động lại thiết bị
      </button>
    </div>
  );
}

export function IntercomPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedDevice = mockDevices.find((d) => d.id === selectedId) ?? null;

  const online = mockDevices.filter((d) => d.status === 'online').length;
  const doorStations = mockDevices.filter((d) => d.type === 'door-station').length;
  const answered = mockCallRecords.filter((c) => c.result === 'answered').length;
  const missed = mockCallRecords.filter((c) => c.result === 'missed').length;

  return (
    <div>
      <PageHeader title="Intercom" description="Hệ thống liên lạc nội bộ và chuông cửa" />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Thiết bị" value={String(mockDevices.length)} sub={`${online} online`} icon="📡" domain="secure" />
        <StatCard label="Door Station" value={String(doorStations)} sub="Trạm cửa" icon="🚪" domain="secure" />
        <StatCard label="Đã trả lời" value={String(answered)} sub={`/${mockCallRecords.length} cuộc gọi`} icon="✅" domain="default" />
        <StatCard label="Cuộc nhỡ" value={String(missed)} sub="Cần kiểm tra" icon="📵" domain="error" />
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Device list */}
        <div className="col-span-2">
          <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Danh sách thiết bị</h2>
          <div className="grid grid-cols-2 gap-2">
            {mockDevices.map((d) => (
              <DeviceCard key={d.id} device={d} selected={selectedId === d.id} onClick={() => setSelectedId(d.id)} />
            ))}
          </div>
        </div>

        {/* Config panel */}
        <div>
          <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Cấu hình thiết bị</h2>
          <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
            <ConfigPanel device={selectedDevice} />
          </div>
        </div>
      </div>

      {/* Call history */}
      <div>
        <h2 className="text-[14px] font-semibold text-[#F8FAFC] mb-3">Lịch sử cuộc gọi</h2>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
          <DataTable columns={callColumns} data={mockCallRecords} rowKey={(r) => r.id} />
        </div>
      </div>
    </div>
  );
}
