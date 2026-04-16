import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader, Button, Select, SelectOption, DataTable, type Column, AppModal, TablePaginationFooter } from '@dm3/ui';
import { fetchSystemDevices, fetchCompanies, apiFetch, type CompanyDTO } from '@/lib/api';
import { RefreshCw, Plus, Pencil, Trash2, Monitor, Wifi, WifiOff, AlertTriangle, Terminal, Cpu, Camera, Gauge, History, Power, PowerOff, RotateCcw, ShieldAlert, Zap, Send, MessageSquare, DoorOpen } from 'lucide-react';
import { fetchDeviceHistory, type DeviceHistoryEvent } from '@/lib/api';

interface SystemDevice {
  id: string;
  company_id: string;
  device_id: string;
  name: string;
  type: string;
  status: string;
  firmware_version: string;
  site_id: string;
  location: string;
  last_seen: string | null;
  created_at: string;
  company_name: string;
}

const statusColors: Record<string, string> = {
  online: 'bg-success/10 text-success',
  offline: 'bg-muted text-muted-foreground',
  warning: 'bg-warning/10 text-warning',
};

// --- Stat Card ---

function StatCard({ icon: Icon, iconBg, iconColor, value, label, sub }: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  value: number; label: string; sub?: string;
}) {
  return (
    <div className="bg-card border border-border/70 rounded-xl p-4 shadow-xs hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        <div>
          <div className="text-2xl font-bold text-foreground">{value}</div>
          <div className="text-[12px] text-muted-foreground">{label}</div>
        </div>
      </div>
      {sub && <div className="text-[11px] text-muted-foreground mt-2">{sub}</div>}
    </div>
  );
}

// --- Device History Config ---

const historyEventConfig: Record<string, { icon: typeof Power; color: string; label: string }> = {
  online:           { icon: Power,         color: 'text-success',          label: 'Online' },
  offline:          { icon: PowerOff,      color: 'text-muted-foreground', label: 'Offline' },
  restart:          { icon: RotateCcw,     color: 'text-operate',          label: 'Restart' },
  emergency:        { icon: ShieldAlert,   color: 'text-error',            label: 'Emergency' },
  sync:             { icon: RefreshCw,     color: 'text-secure',           label: 'Data Sync' },
  config_ack:       { icon: Zap,           color: 'text-manage',           label: 'Config Ack' },
  error:            { icon: AlertTriangle, color: 'text-warning',          label: 'Error' },
  command:          { icon: Terminal,       color: 'text-secure',           label: 'Command' },
  command_response: { icon: MessageSquare, color: 'text-success',          label: 'Response' },
  door_command:     { icon: Send,          color: 'text-operate',          label: 'Door Command' },
  door_state:       { icon: DoorOpen,      color: 'text-operate',          label: 'Door State' },
  firmware_update:  { icon: RefreshCw,     color: 'text-secure',           label: 'Firmware' },
};
const defaultEventCfg = { icon: Zap, color: 'text-muted-foreground', label: 'Event' };

function DeviceHistoryModal({ device, onClose }: { device: SystemDevice; onClose: () => void }) {
  const { t } = useTranslation('devices');
  const [events, setEvents] = useState<DeviceHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDeviceHistory(device.id, page, pageSize)
      .then((res) => { if (!cancelled) { setEvents(res.data || []); setTotal(res.total ?? 0); } })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [device.id, page]);

  return (
    <AppModal open onOpenChange={(v) => { if (!v) onClose(); }}
      title={<span className="inline-flex items-center gap-2"><History size={16} /> Device History — {device.name || device.device_id}</span>}
      description="Lifecycle events: on/off, restarts, commands, firmware, syncs"
      size="2xl" showCancelButton cancelLabel="Close">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-secure/30 border-t-secure rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-muted-foreground">No history events</div>
      ) : (
        <div className="space-y-1">
          {events.map((evt) => {
            const cfg = historyEventConfig[evt.event_type] || defaultEventCfg;
            const Icon = cfg.icon;
            return (
              <div key={evt.id} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}><Icon size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-medium uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                    {evt.actor_email && <span className="text-[11px] text-muted-foreground">by {evt.actor_email}</span>}
                  </div>
                  <p className="text-[13px] text-foreground mt-0.5">{evt.description}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{new Date(evt.time).toLocaleString()}</span>
              </div>
            );
          })}
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
            <span className="text-[11px] text-muted-foreground">Page {page} of {Math.ceil(total / pageSize) || 1} · {total} total</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-7 text-[11px] px-2">Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)} className="h-7 text-[11px] px-2">Next</Button>
            </div>
          </div>
        </div>
      )}
    </AppModal>
  );
}

// --- Main ---

export function SystemDevicesPage() {
  const navigate = useNavigate();
  const { t: tSystem } = useTranslation('system');
  const { t: tDevices } = useTranslation('devices');

  // All devices (unfiltered) for stats
  const [allDevices, setAllDevices] = useState<SystemDevice[]>([]);
  // Filtered devices for table
  const [devices, setDevices] = useState<SystemDevice[]>([]);
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingDevice, setDeletingDevice] = useState<SystemDevice | null>(null);
  const [deleting, setDeleting] = useState(false);

  // History modal
  const [historyDevice, setHistoryDevice] = useState<SystemDevice | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const filterParams: Record<string, string> = {};
      if (filterCompany) filterParams.company_id = filterCompany;
      if (filterStatus) filterParams.status = filterStatus;
      if (filterType) filterParams.type = filterType;

      const hasFilters = filterCompany || filterStatus || filterType;

      const [filteredDevs, allDevs, comps] = await Promise.all([
        fetchSystemDevices(filterParams),
        hasFilters ? fetchSystemDevices({}) : Promise.resolve(null),
        companies.length ? Promise.resolve(companies) : fetchCompanies(),
      ]);

      setDevices(filteredDevs);
      setAllDevices(allDevs ?? filteredDevs);
      if (!companies.length) setCompanies(comps);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [filterCompany, filterStatus, filterType]);

  // Stats from allDevices (unfiltered)
  const stats = useMemo(() => {
    const total = allDevices.length;
    const online = allDevices.filter(d => d.status === 'online').length;
    const offline = allDevices.filter(d => d.status === 'offline').length;
    const warning = allDevices.filter(d => d.status === 'warning').length;
    const terminals = allDevices.filter(d => d.type === 'terminal').length;
    const controllers = allDevices.filter(d => d.type === 'controller').length;
    const cameras = allDevices.filter(d => d.type === 'camera').length;
    const sensors = allDevices.filter(d => d.type === 'sensor').length;
    return { total, online, offline, warning, terminals, controllers, cameras, sensors };
  }, [allDevices]);

  const handleDeleteOpen = (device: SystemDevice) => {
    setDeletingDevice(device);
    setShowDeleteModal(true);
  };

  const handleDeleteDevice = async () => {
    if (!deletingDevice) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/v1/gateway/devices/${deletingDevice.id}`, { method: 'DELETE' });
      setShowDeleteModal(false);
      await loadData();
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<Column<SystemDevice>[]>(() => [
    {
      key: 'device_id',
      header: tSystem('systemDevices.table.device'),
      render: (d) => <span className="font-mono">{d.device_id}</span>,
    },
    {
      key: 'name',
      header: tDevices('devices.table.name'),
      render: (d) => d.name || '—',
    },
    {
      key: 'company_name',
      header: tSystem('systemDevices.table.company'),
      render: (d) => d.company_name || '—',
    },
    {
      key: 'type',
      header: tSystem('systemDevices.table.type'),
      render: (d) => <span className="capitalize">{d.type}</span>,
    },
    {
      key: 'status',
      header: tSystem('systemDevices.table.status'),
      render: (d) => (
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[d.status] || statusColors.offline}`}>
          {d.status}
        </span>
      ),
    },
    {
      key: 'location',
      header: tSystem('systemDevices.table.location'),
      render: (d) => d.location || '—',
    },
    {
      key: 'last_seen',
      header: tSystem('systemDevices.table.lastSeen'),
      render: (d) => d.last_seen ? new Date(d.last_seen).toLocaleString() : '—',
    },
    {
      key: 'actions' as keyof SystemDevice,
      header: '',
      render: (d) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" title="Edit" onClick={() => navigate(`/system/devices/${d.id}/edit`)} data-testid={`sysdevice-button-edit-${d.device_id}`}>
            <Pencil size={14} className="text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="sm" title="Delete" onClick={() => handleDeleteOpen(d)} data-testid={`sysdevice-button-delete-${d.device_id}`}>
            <Trash2 size={14} className="text-destructive" />
          </Button>
          <Button variant="ghost" size="sm" title="History" onClick={() => setHistoryDevice(d)} data-testid={`sysdevice-button-history-${d.device_id}`}>
            <History size={14} />
          </Button>
        </div>
      ),
    },
  ], [tSystem, tDevices]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden p-6">
      <div className="shrink-0">
        <PageHeader title={tSystem('systemDevices.title')} description={tSystem('systemDevices.description')}>
          <div className="flex gap-2">
            <Button data-testid="sysdevice-button-create" size="sm" onClick={() => navigate('/system/devices/new')} className="gap-1">
              <Plus size={13} /> {tSystem('createDevice.title')}
            </Button>
            <Button data-testid="sysdevice-button-refresh" variant="outline" size="sm" onClick={loadData} className="gap-1">
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </Button>
          </div>
        </PageHeader>
      </div>

      {/* Stats Dashboard */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Monitor} iconBg="bg-operate/10" iconColor="text-operate" value={stats.total} label={tSystem('systemDevices.stats.total')} />
        <StatCard icon={Wifi} iconBg="bg-success/10" iconColor="text-success" value={stats.online} label={tSystem('systemDevices.stats.online')} />
        <StatCard icon={WifiOff} iconBg="bg-muted" iconColor="text-muted-foreground" value={stats.offline} label={tSystem('systemDevices.stats.offline')} />
        <StatCard icon={AlertTriangle} iconBg="bg-warning/10" iconColor="text-warning" value={stats.warning} label={tSystem('systemDevices.stats.warning')} />
      </div>

      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Terminal} iconBg="bg-cyan-500/10" iconColor="text-cyan-500" value={stats.terminals} label={tSystem('systemDevices.type.terminal')} />
        <StatCard icon={Cpu} iconBg="bg-purple-500/10" iconColor="text-purple-500" value={stats.controllers} label={tSystem('systemDevices.type.controller')} />
        <StatCard icon={Camera} iconBg="bg-blue-500/10" iconColor="text-blue-500" value={stats.cameras} label={tSystem('systemDevices.type.camera')} />
        <StatCard icon={Gauge} iconBg="bg-orange-500/10" iconColor="text-orange-500" value={stats.sensors} label={tSystem('systemDevices.type.sensor')} />
      </div>

      {/* Filters */}
      <div className="shrink-0 flex gap-3">
        <Select value={filterCompany} onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }} className="w-48 h-8 text-[12px]">
          <SelectOption value="">{tDevices('devices.filter.allCompanies')}</SelectOption>
          {companies.map((c) => <SelectOption key={c.id} value={c.id}>{c.name}</SelectOption>)}
        </Select>
        <Select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="w-36 h-8 text-[12px]">
          <SelectOption value="">{tSystem('systemDevices.filter.allStatus')}</SelectOption>
          <SelectOption value="online">{tSystem('systemDevices.status.online')}</SelectOption>
          <SelectOption value="offline">{tSystem('systemDevices.status.offline')}</SelectOption>
          <SelectOption value="warning">{tSystem('systemDevices.status.warning')}</SelectOption>
        </Select>
        <Select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }} className="w-36 h-8 text-[12px]">
          <SelectOption value="">{tSystem('systemDevices.filter.allTypes')}</SelectOption>
          <SelectOption value="terminal">{tSystem('systemDevices.type.terminal')}</SelectOption>
          <SelectOption value="controller">{tSystem('systemDevices.type.controller')}</SelectOption>
          <SelectOption value="camera">{tSystem('systemDevices.type.camera')}</SelectOption>
          <SelectOption value="sensor">{tSystem('systemDevices.type.sensor')}</SelectOption>
        </Select>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={loading}
            data-testid="sysdevice-table-list"
            columns={columns}
            data={devices.slice((page - 1) * pageSize, page * pageSize)}
            rowKey={(d) => d.id}
            rowTestId={(d) => `sysdevice-row-${d.id}`}
            emptyMessage="No devices found"
            emptyIcon={<Monitor size={32} strokeWidth={1.2} />}
          />
        </div>
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          total={devices.length}
          totalPages={Math.ceil(devices.length / pageSize)}
          onPageChange={setPage}
          loading={loading}
        />
      </div>

      {/* Delete Device Modal */}
      <AppModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title={tSystem('createDevice.delete.title')}
        size="sm"
        showCancelButton
        cancelLabel="Cancel"
        primaryAction={{
          label: deleting ? 'Deleting...' : 'Delete',
          onClick: handleDeleteDevice,
          disabled: deleting,
          loading: deleting,
          variant: 'destructive',
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {tSystem('createDevice.delete.confirm')} <span className="font-semibold">{deletingDevice?.name || deletingDevice?.device_id || ''}</span>?
          </p>
          <p className="text-xs text-muted-foreground">{tSystem('createDevice.delete.warning')}</p>
        </div>
      </AppModal>

      {/* History Modal */}
      {historyDevice && (
        <DeviceHistoryModal device={historyDevice} onClose={() => setHistoryDevice(null)} />
      )}
    </div>
  );
}
