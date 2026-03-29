import { useState, useEffect } from 'react';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { fetchDevices, type DeviceDTO } from '@/lib/api';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useRealtimeStore, useDeviceStatus } from '@dm3/api-client';

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

  // Real-time state — connection managed by <RealtimeProvider> in App.tsx
  const isConnected = useRealtimeStore((s) => s.connected);
  const deviceStatuses = useDeviceStatus() as any[];

  useEffect(() => {
    fetchDevices().then(setDevices).catch(() => {});
  }, []);

  // Merge API data with real-time status
  const devicesWithRealtimeStatus = devices.map(device => {
    const realtimeStatus = deviceStatuses.find(s => s.deviceId === device.device_id);
    if (realtimeStatus) {
      return {
        ...device,
        status: realtimeStatus.online ? 'online' : 'offline',
        last_seen: realtimeStatus.lastSeen.toISOString(),
        realtimeData: realtimeStatus,
      };
    }
    return device;
  });

  const columns: Column<any>[] = [
    { key: 'device_id', header: 'ID', width: '80px', render: (r) => <span className="font-mono text-[12px] text-[#F8FAFC]">{r.device_id}</span> },
    { key: 'name', header: 'Name', render: (r) => <span className="text-[#F8FAFC]">{r.name || '—'}</span> },
    { key: 'type', header: 'Type', render: (r) => <span className="text-[#94A3B8] capitalize">{r.type}</span> },
    { key: 'status', header: 'Status', width: '100px', render: (r) => (
      <div className="flex items-center gap-2">
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[r.status] || statusColors.offline}`}>
          {r.status}
        </span>
        {r.realtimeData && isConnected && (
          <span className="text-[10px] text-[#22C55E]">●</span>
        )}
      </div>
    )},
    { key: 'location', header: 'Location', render: (r) => <span className="text-[#64748B]">{r.location || '—'}</span> },
    { 
      key: 'last_seen', 
      header: 'Last Seen', 
      width: '130px', 
      render: (r) => {
        const lastSeen = r.last_seen ? new Date(r.last_seen).toLocaleString() : '—';
        const hasRealtimeData = r.realtimeData && isConnected;
        return (
          <div className="text-[12px]">
            <span className={hasRealtimeData ? 'text-[#22C55E]' : 'text-[#64748B]'}>
              {lastSeen}
            </span>
            {r.realtimeData && (
              <div className="text-[10px] text-[#64748B] mt-0.5">
                CPU: {r.realtimeData.cpuPct}% | Mem: {r.realtimeData.memPct}%
              </div>
            )}
          </div>
        );
      }
    },
  ];

  const handleRowClick = (device: any) => {
    navigate(`/devices/${device.id}`);
  };

  const onlineCount = devicesWithRealtimeStatus.filter(d => d.status === 'online').length;
  const totalCount = devicesWithRealtimeStatus.length;

  return (
    <div>
      <PageHeader title="Devices" description={`${onlineCount}/${totalCount} online • ${isConnected ? 'Live' : 'Offline'}`}>
        <button onClick={() => navigate('/devices/provision')} className="flex items-center gap-1.5 px-3 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-md text-[13px] font-medium transition-colors">
          <Plus size={15} /> Add Device
        </button>
      </PageHeader>

      <DataTable 
        columns={columns} 
        data={devicesWithRealtimeStatus} 
        rowKey={(r) => r.id}
        onRowClick={handleRowClick}
      />
    </div>
  );
}
