import { useNavigate } from 'react-router-dom';
import { Plus, Clock, Monitor, Cpu, Camera, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { useDevicesList, useRealtimeStore, useDeviceStatus, type DeviceDTO } from '@dm3/api-client';

const statusColors: Record<string, string> = {
  online: 'bg-[#22C55E]/10 text-[#22C55E]',
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  offline: 'bg-[#64748B]/10 text-[#64748B]',
  provisioning: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  disabled: 'bg-[#EF4444]/10 text-[#EF4444]',
};

const deviceTypeIcon = (type: string) => {
  switch (type) {
    case 'terminal': return <Monitor size={13} className="text-[#3B82F6]" />;
    case 'controller': return <Cpu size={13} className="text-[#8B5CF6]" />;
    case 'camera': return <Camera size={13} className="text-[#F59E0B]" />;
    case 'sensor': return <Radio size={13} className="text-[#06B6D4]" />;
    default: return <Cpu size={13} className="text-[#64748B]" />;
  }
};

export function DevicesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('devices');

  // TanStack Query — auto-refetches every 15s
  const { data: devices = [] } = useDevicesList();

  // Real-time state — connection managed by <RealtimeProvider> in App.tsx
  const isConnected = useRealtimeStore((s) => s.connected);
  const deviceStatuses = useDeviceStatus() as any[];

  // Merge API data with real-time status
  const devicesWithRealtimeStatus = (devices as DeviceDTO[]).map((device: DeviceDTO) => {
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
    {
      key: 'device_id',
      header: t('devices.table.id'),
      width: '80px',
      render: (r) => <span className="font-mono text-[12px] text-[#F8FAFC]">{r.device_id}</span>,
    },
    {
      key: 'name',
      header: t('devices.table.name'),
      render: (r) => <span className="text-[#F8FAFC]">{r.name || '—'}</span>,
    },
    {
      key: 'type',
      header: t('devices.table.type'),
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {deviceTypeIcon(r.type)}
          <span className="text-[#94A3B8] capitalize text-[12px]">{r.type}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('devices.table.status'),
      width: '110px',
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[r.status] || statusColors.offline}`}>
            {r.status}
          </span>
          {r.realtimeData && isConnected && (
            <span className="text-[10px] text-[#22C55E]">●</span>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: t('devices.table.location'),
      render: (r) => <span className="text-[#64748B]">{r.location || '—'}</span>,
    },
    {
      key: 'last_seen',
      header: t('devices.table.lastSeen'),
      width: '140px',
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
      },
    },
  ];

  const handleRowClick = (device: DeviceDTO) => {
    navigate(`/devices/${device.id}`);
  };

  const onlineCount = devicesWithRealtimeStatus.filter((d: { status: string }) => d.status === 'online').length;
  const totalCount = devicesWithRealtimeStatus.length;

  return (
    <div>
      <PageHeader
        title={t('devices.title')}
        description={`${onlineCount}/${totalCount} online • ${isConnected ? 'Live' : 'Offline'}`}
      >
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/devices/pending')}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1E293B] hover:bg-[#334155] text-[#F8FAFC] border border-[#334155] rounded-md text-[13px] font-medium transition-colors"
          >
            <Clock size={15} /> {t('devices.pending')}
          </button>
          <button
            onClick={() => navigate('/devices/provision')}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-md text-[13px] font-medium transition-colors"
          >
            <Plus size={15} /> {t('devices.addDevice')}
          </button>
        </div>
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
