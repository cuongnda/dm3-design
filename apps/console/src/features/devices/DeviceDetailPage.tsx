import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, DataTable, type Column, Button, useBreadcrumbStore } from '@dm3/ui';
import { fetchDeviceEvents, type EventDTO } from '@/lib/api';
import { useDevice, useSendCommand } from '@/lib/hooks';
import { useRealtimeStore, useDeviceStatus } from '@dm3/api-client';
import { ArrowLeft, Unlock, Lock, RotateCcw, Camera, Wifi, WifiOff } from 'lucide-react';

const statusColors: Record<string, string> = {
  online: 'bg-success/10 text-success',
  offline: 'bg-muted text-muted-foreground',
  warning: 'bg-warning/10 text-warning',
};

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('devices');
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);
  const [recentEvents, setRecentEvents] = useState<EventDTO[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const { data: device, isLoading: loading } = useDevice(id!);
  const sendCommand = useSendCommand();

  // Real-time status
  const isConnected = useRealtimeStore((s) => s.connected);
  const deviceStatuses = useDeviceStatus() as any[];
  const realtimeStatus = device ? deviceStatuses.find(s => s.deviceId === device.device_id) : null;

  const commandButtons = [
    { id: 'unlock', label: t('deviceDetail.command.unlock'), icon: Unlock, color: 'bg-success hover:bg-success/90' },
    { id: 'lock', label: t('deviceDetail.command.lock'), icon: Lock, color: 'bg-error hover:bg-error/90' },
    { id: 'reboot', label: t('deviceDetail.command.reboot'), icon: RotateCcw, color: 'bg-operate hover:bg-operate/90' },
    { id: 'snapshot', label: t('deviceDetail.command.snapshot'), icon: Camera, color: 'bg-secure hover:bg-secure/90' },
  ];

  useEffect(() => {
    if (!device) return;

    const loadEvents = async () => {
      setEventsLoading(true);
      try {
        // Load recent events for this device via the device-specific endpoint
        const result = await fetchDeviceEvents(device.id, 1, 20);
        setRecentEvents(result.data || []);
      } catch {
        // ignore
      } finally {
        setEventsLoading(false);
      }
    };

    loadEvents();
  }, [device]);

  useEffect(() => {
    if (id && device?.name) setLabel(id, device.name);
    return () => { if (id) clearLabel(id); };
  }, [id, device?.name, setLabel, clearLabel]);

  const handleCommand = async (commandId: string) => {
    if (!device) return;

    try {
      await sendCommand.mutateAsync({
        deviceId: device.id,
        command: commandId,
        params: {},
      });
    } catch (error) {
      console.error('Command failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-secure/30 border-t-secure rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/devices')} className="mb-4 gap-1">
          <ArrowLeft size={14} /> Back to Devices
        </Button>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Device not found</p>
        </div>
      </div>
    );
  }

  // Merge API data with real-time status
  const deviceWithRealtimeStatus = {
    ...device,
    status: realtimeStatus?.online ? 'online' : device.status,
    last_seen: realtimeStatus?.lastSeen?.toISOString() || device.last_seen,
    realtimeData: realtimeStatus,
  };

  const eventColumns: Column<EventDTO>[] = [
    {
      key: 'time',
      header: 'Time',
      width: '140px',
      render: (r) => (
        <span className="text-[12px] text-muted-foreground font-mono">
          {new Date(r.time).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'person_name',
      header: 'Person',
      render: (r) => (
        <span className="text-[13px] text-foreground">
          {r.person_name || '—'}
        </span>
      ),
    },
    {
      key: 'decision',
      header: 'Decision',
      width: '100px',
      render: (r) => {
        const isGranted = r.decision === 'granted';
        return (
          <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${
            isGranted ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}>
            {isGranted ? t('deviceDetail.event.granted') : t('deviceDetail.event.denied')}
          </span>
        );
      },
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => (
        <span className="text-[12px] text-muted-foreground">
          {r.reason || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" onClick={() => navigate('/devices')} className="mb-4 gap-1">
        <ArrowLeft size={14} /> Back to Devices
      </Button>

      <PageHeader
        title={`Device: ${deviceWithRealtimeStatus.device_id}`}
        description={deviceWithRealtimeStatus.name || 'Unnamed device'}
        data-testid="device-detail-header"
      />

      {/* Device Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Basic Info */}
        <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4" data-testid="detail-card-info">
          <h3 className="text-[14px] font-medium text-foreground mb-3">Device Information</h3>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <span className="text-muted-foreground">{t('deviceDetail.field.deviceId')}:</span>
              <span className="ml-2 text-foreground font-mono">{device.device_id}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('deviceDetail.field.type')}:</span>
              <span className="ml-2 text-foreground capitalize">{device.type}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('deviceDetail.field.status')}:</span>
              <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                statusColors[deviceWithRealtimeStatus.status] || statusColors.offline
              }`}>
                {deviceWithRealtimeStatus.status}
              </span>
              {realtimeStatus && isConnected && (
                <Wifi size={12} className="inline ml-1 text-success" />
              )}
            </div>
            <div>
              <span className="text-muted-foreground">{t('deviceDetail.field.lastSeen')}:</span>
              <span className="ml-2 text-foreground font-mono text-[12px]">
                {deviceWithRealtimeStatus.last_seen
                  ? new Date(deviceWithRealtimeStatus.last_seen).toLocaleString()
                  : '—'
                }
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('deviceDetail.field.firmware')}:</span>
              <span className="ml-2 text-foreground font-mono">{device.firmware_version || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('deviceDetail.field.location')}:</span>
              <span className="ml-2 text-foreground">{device.location || '—'}</span>
            </div>
          </div>

          {/* Real-time Performance Data */}
          {realtimeStatus && isConnected && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-[13px] font-medium text-muted-foreground mb-2">{t('deviceDetail.livePerformance')}</h4>
              <div className="grid grid-cols-3 gap-4 text-[12px]">
                <div>
                  <span className="text-muted-foreground">CPU:</span>
                  <span className="ml-2 text-success font-mono">{realtimeStatus.cpuPct ?? '—'}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Memory:</span>
                  <span className="ml-2 text-success font-mono">{realtimeStatus.memPct ?? '—'}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Uptime:</span>
                  <span className="ml-2 text-success font-mono">
                    {realtimeStatus.uptimeSeconds ? Math.floor(realtimeStatus.uptimeSeconds / 3600) : '—'}h
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Commands */}
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="text-[14px] font-medium text-foreground mb-3" data-testid="detail-section-commands">{t('deviceDetail.commands')}</h3>
          <div className="space-y-2">
            {commandButtons.map(({ id, label, icon: Icon, color }) => (
              <button
                type="button"
                key={id}
                onClick={() => handleCommand(id)}
                disabled={sendCommand.isPending || deviceWithRealtimeStatus.status === 'offline'}
                data-testid={`detail-button-cmd-${id}`}
                className={`w-full flex items-center gap-2 px-3 py-2 ${color} text-white rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {sendCommand.isPending && (
            <p className="text-[12px] text-secure mt-2">Sending command...</p>
          )}

          {deviceWithRealtimeStatus.status === 'offline' && (
            <p className="text-[12px] text-muted-foreground mt-2">
              <WifiOff size={12} className="inline mr-1" />
              Device offline - commands unavailable
            </p>
          )}
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-card border border-border rounded-lg">
        <div className="p-4 border-b border-border">
          <h3 className="text-[14px] font-medium text-foreground">{t('deviceDetail.recentEvents')}</h3>
        </div>
        {eventsLoading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-secure/30 border-t-secure rounded-full animate-spin mx-auto" />
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-muted-foreground">
            No recent events
          </div>
        ) : (
          <DataTable
            columns={eventColumns}
            data={recentEvents}
            rowKey={(r) => r.id}
          />
        )}
      </div>
    </div>
  );
}
