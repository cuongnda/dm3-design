import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { fetchDevices, type DeviceDTO } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

const statusColors: Record<string, string> = {
  online: 'bg-[#22C55E]/10 text-[#22C55E]',
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  offline: 'bg-[#64748B]/10 text-[#64748B]',
  provisioning: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  disabled: 'bg-[#EF4444]/10 text-[#EF4444]',
};

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDTO[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDevices().then(setDevices).catch(() => {});
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
      <PageHeader title="Devices" description={`${devices.length} provisioned devices`}>
        <button onClick={() => navigate('/devices/provision')} className="flex items-center gap-1.5 px-3 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-md text-[13px] font-medium transition-colors">
          <Plus size={15} /> Add Device
        </button>
      </PageHeader>

      <DataTable columns={columns} data={devices} rowKey={(r) => r.id} />
    </div>
  );
}
