import { useNavigate } from 'react-router-dom';
import { Plus, Clock, Monitor, Cpu, Camera, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader, DataTable, type Column, Button } from '@dm3/ui';
import { useDevicesList, useRealtimeStore, useDeviceStatus, type DeviceDTO } from '@dm3/api-client';

const statusColors: Record<string, string> = {
  online: 'bg-success/10 text-success',
  active: 'bg-success/10 text-success',
  offline: 'bg-muted text-muted-foreground',
  provisioning: 'bg-secure/10 text-secure',
  disabled: 'bg-error/10 text-error',
};

const deviceTypeIcon = (type: string) => {
  switch (type) {
    case 'terminal': return <Monitor size={13} className="text-secure" />;
    case 'controller': return <Cpu size={13} className="text-manage" />;
    case 'camera': return <Camera size={13} className="text-operate" />;
    case 'sensor': return <Radio size={13} className="text-smart" />;
    default: return <Cpu size={13} className="text-muted-foreground" />;
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
      render: (r) => <span className="font-mono text-[12px] text-foreground">{r.device_id}</span>,
    },
    {
      key: 'name',
      header: t('devices.table.name'),
      render: (r) => <span className="text-foreground">{r.name || '—'}</span>,
    },
    {
      key: 'type',
      header: t('devices.table.type'),
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {deviceTypeIcon(r.type)}
          <span className="text-muted-foreground capitalize text-[12px]">{r.type}</span>
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
            <span className="text-[10px] text-success">●</span>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: t('devices.table.location'),
      render: (r) => <span className="text-muted-foreground">{r.location || '—'}</span>,
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
            <span className={hasRealtimeData ? 'text-success' : 'text-muted-foreground'}>
              {lastSeen}
            </span>
            {r.realtimeData && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
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
          <Button variant="outline" size="sm" onClick={() => navigate('/devices/pending')} className="gap-1.5">
            <Clock size={15} /> {t('devices.pending')}
          </Button>
          <Button size="sm" onClick={() => navigate('/devices/provision')} className="gap-1.5">
            <Plus size={15} /> {t('devices.addDevice')}
          </Button>
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
