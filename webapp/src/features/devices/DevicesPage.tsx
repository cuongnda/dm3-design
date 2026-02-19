import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { fetchDevices, fetchPendingDevices, type DeviceDTO } from '@/lib/api';
import { PendingDevicesPage } from './PendingDevicesPage';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = ['Devices', 'Pending'] as const;

const statusColors: Record<string, string> = {
  online: 'bg-[#22C55E]/10 text-[#22C55E]',
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  offline: 'bg-[#64748B]/10 text-[#64748B]',
  provisioning: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  disabled: 'bg-[#EF4444]/10 text-[#EF4444]',
};

export function DevicesPage() {
  const [activeTab, setActiveTab] = useState<typeof tabs[number]>('Devices');
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      fetchDevices().then(setDevices).catch(() => {}),
      fetchPendingDevices().then((p) => setPendingCount(p.length)).catch(() => {}),
    ]);
  }, []);

  const columns: Column<DeviceDTO>[] = [
    { key: 'device_id', header: 'ID', width: '80px', render: (r) => <span className="font-mono text-[12px] text-[#F8FAFC]">{r.device_id}</span> },
    { key: 'name', header: 'Name', render: (r) => <span className="text-[#F8FAFC]">{r.name || '—'}</span> },
    { key: 'type', header: 'Type', render: (r) => <span className="text-[#94A3B8] capitalize">{r.type}</span> },
    { key: 'status', header: 'Status', width: '100px', render: (r) => (
      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[r.status] || statusColors.offline}`}>{r.status}</span>
    )},
    { key: 'location', header: 'Location', render: (r) => <span className="text-[#64748B]">{r.location || '—'}</span> },
    { key: 'last_seen', header: 'Last Seen', width: '130px', render: (r) => <span className="text-[#64748B] text-[12px]">{r.last_seen ? new Date(r.last_seen).toLocaleString() : '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title="Devices" description={`${devices.length} devices registered`}>
        <button onClick={() => navigate('/devices/provision')} className="flex items-center gap-1.5 px-3 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-md text-[13px] font-medium transition-colors">
          <Plus size={15} /> Add Device
        </button>
      </PageHeader>

      <div className="flex border-b border-[#1E293B] mb-4">
        {tabs.map((t) => (
          <button key={t} onClick={() => setActiveTab(t)} className={cn(
            'px-4 py-2 text-[13px] font-medium border-b-2 transition-colors',
            activeTab === t ? 'text-[#F8FAFC] border-[#3B82F6]' : 'text-[#94A3B8] border-transparent hover:text-[#F8FAFC]'
          )}>
            {t}
            {t === 'Pending' && pendingCount > 0 && (
              <span className="ml-1.5 text-[11px] px-1.5 rounded-full text-[#3B82F6] bg-[#3B82F6]/20">{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'Devices' && (
        <DataTable columns={columns} data={devices} rowKey={(r) => r.id} />
      )}

      {activeTab === 'Pending' && <PendingDevicesPage isSystemAdmin={false} />}
    </div>
  );
}
