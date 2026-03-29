import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@dm3/ui';
import { DataTable, type Column } from '@dm3/ui';
import { fetchDeviceEvents, type EventDTO } from '@/lib/api';
import { useDevice, useSendCommand } from '@/lib/hooks';
import { useRealtimeStore, useDeviceStatus } from '@dm3/api-client';
import { ArrowLeft, Unlock, Lock, RotateCcw, Camera, Wifi, WifiOff } from 'lucide-react';

const statusColors: Record<string, string> = {
  online: 'bg-[#22C55E]/10 text-[#22C55E]',
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  offline: 'bg-[#64748B]/10 text-[#64748B]',
  provisioning: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  disabled: 'bg-[#EF4444]/10 text-[#EF4444]',
  error: 'bg-[#EF4444]/10 text-[#EF4444]',
};

const commandButtons = [
  { id: 'unlock', label: 'Unlock', icon: Unlock, color: 'bg-[#22C55E] hover:bg-[#16A34A]' },
  { id: 'lock', label: 'Lock', icon: Lock, color: 'bg-[#EF4444] hover:bg-[#DC2626]' },
  { id: 'reboot', label: 'Reboot', icon: RotateCcw, color: 'bg-[#F97316] hover:bg-[#EA580C]' },
  { id: 'snapshot', label: 'Snapshot', icon: Camera, color: 'bg-[#3B82F6] hover:bg-[#2563EB]' },
];

export function DeviceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recentEvents, setRecentEvents] = useState<EventDTO[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  const { data: device, isLoading: loading } = useDevice(id!);
  const sendCommand = useSendCommand();

  // Real-time status
  const isConnected = useRealtimeStore((s) => s.connected);
  const deviceStatuses = useDeviceStatus() as any[];
  const realtimeStatus = device ? deviceStatuses.find(s => s.deviceId === device.device_id) : null;

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
          <div className="w-6 h-6 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!device) {
    return (
      <div className="p-6">
        <button 
          onClick={() => navigate('/devices')} 
          className="flex items-center gap-1 text-[13px] text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Devices
        </button>
        <div className="text-center py-12">
          <p className="text-[#64748B]">Device not found</p>
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
        <span className="text-[12px] text-[#94A3B8] font-mono">
          {new Date(r.time).toLocaleString()}
        </span>
      ),
    },
    { 
      key: 'person_name', 
      header: 'Person', 
      render: (r) => (
        <span className="text-[13px] text-[#F8FAFC]">
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
            isGranted ? 'bg-[#22C55E]/10 text-[#22C55E]' : 'bg-[#EF4444]/10 text-[#EF4444]'
          }`}>
            {r.decision}
          </span>
        );
      },
    },
    { 
      key: 'reason', 
      header: 'Reason', 
      render: (r) => (
        <span className="text-[12px] text-[#64748B]">
          {r.reason || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <button 
        onClick={() => navigate('/devices')} 
        className="flex items-center gap-1 text-[13px] text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors"
      >
        <ArrowLeft size={14} /> Back to Devices
      </button>

      <PageHeader 
        title={`Device: ${deviceWithRealtimeStatus.device_id}`}
        description={deviceWithRealtimeStatus.name || 'Unnamed device'}
      />

      {/* Device Info Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Basic Info */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Device Information</h3>
          <div className="grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <span className="text-[#64748B]">ID:</span>
              <span className="ml-2 text-[#F8FAFC] font-mono">{device.device_id}</span>
            </div>
            <div>
              <span className="text-[#64748B]">Type:</span>
              <span className="ml-2 text-[#F8FAFC] capitalize">{device.type}</span>
            </div>
            <div>
              <span className="text-[#64748B]">Status:</span>
              <span className={`ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${
                statusColors[deviceWithRealtimeStatus.status] || statusColors.offline
              }`}>
                {deviceWithRealtimeStatus.status}
              </span>
              {realtimeStatus && isConnected && (
                <Wifi size={12} className="inline ml-1 text-[#22C55E]" />
              )}
            </div>
            <div>
              <span className="text-[#64748B]">Last Seen:</span>
              <span className="ml-2 text-[#F8FAFC] font-mono text-[12px]">
                {deviceWithRealtimeStatus.last_seen 
                  ? new Date(deviceWithRealtimeStatus.last_seen).toLocaleString()
                  : '—'
                }
              </span>
            </div>
            <div>
              <span className="text-[#64748B]">Firmware:</span>
              <span className="ml-2 text-[#F8FAFC] font-mono">{device.firmware_version || '—'}</span>
            </div>
            <div>
              <span className="text-[#64748B]">Location:</span>
              <span className="ml-2 text-[#F8FAFC]">{device.location || '—'}</span>
            </div>
          </div>

          {/* Real-time Performance Data */}
          {realtimeStatus && isConnected && (
            <div className="mt-4 pt-4 border-t border-[#1E293B]">
              <h4 className="text-[13px] font-medium text-[#94A3B8] mb-2">Live Performance</h4>
              <div className="grid grid-cols-3 gap-4 text-[12px]">
                <div>
                  <span className="text-[#64748B]">CPU:</span>
                  <span className="ml-2 text-[#22C55E] font-mono">{realtimeStatus.cpuPct ?? '—'}%</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Memory:</span>
                  <span className="ml-2 text-[#22C55E] font-mono">{realtimeStatus.memPct ?? '—'}%</span>
                </div>
                <div>
                  <span className="text-[#64748B]">Uptime:</span>
                  <span className="ml-2 text-[#22C55E] font-mono">
                    {realtimeStatus.uptimeSeconds ? Math.floor(realtimeStatus.uptimeSeconds / 3600) : '—'}h
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Commands */}
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <h3 className="text-[14px] font-medium text-[#F8FAFC] mb-3">Device Commands</h3>
          <div className="space-y-2">
            {commandButtons.map(({ id, label, icon: Icon, color }) => (
              <button
                key={id}
                onClick={() => handleCommand(id)}
                disabled={sendCommand.isPending || deviceWithRealtimeStatus.status === 'offline'}
                className={`w-full flex items-center gap-2 px-3 py-2 ${color} text-white rounded-md text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          
          {sendCommand.isPending && (
            <p className="text-[12px] text-[#3B82F6] mt-2">Sending command...</p>
          )}
          
          {deviceWithRealtimeStatus.status === 'offline' && (
            <p className="text-[12px] text-[#64748B] mt-2">
              <WifiOff size={12} className="inline mr-1" />
              Device offline - commands unavailable
            </p>
          )}
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg">
        <div className="p-4 border-b border-[#1E293B]">
          <h3 className="text-[14px] font-medium text-[#F8FAFC]">Recent Events</h3>
        </div>
        {eventsLoading ? (
          <div className="p-8 text-center">
            <div className="w-5 h-5 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin mx-auto" />
          </div>
        ) : recentEvents.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[#64748B]">
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