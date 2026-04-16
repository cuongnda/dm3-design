import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Search, Monitor, Camera, Cpu, Settings, Terminal, Gauge, Edit, Send, History, Power, PowerOff, RotateCcw, ShieldAlert, Wifi, WifiOff, AlertTriangle, Zap, RefreshCw, MessageSquare, DoorOpen } from 'lucide-react';
import { Button, Card, CardContent, Input, AppModal, Label, Select, Tabs, TabsList, TabsTrigger, TabsContent, DataTable, type Column, TablePaginationFooter, Checkbox } from '@dm3/ui';
import { useRealtimeStore } from '@dm3/api-client';
import { apiFetch, fetchDeviceHistory, type DeviceHistoryEvent } from '@/lib/api';
import { toast } from '@/lib/toast';

// --- Types ---

interface DeviceConfig {
  // General (all types)
  access_control?: {
    mode?: string;
    door_unlock_duration_ms?: number;
    max_failed_attempts?: number;
    lockout_duration_ms?: number;
    anti_passback?: boolean;
    local_db_max_persons?: number;
  };
  network?: {
    heartbeat_interval_ms?: number;
    offline_queue_max?: number;
    retry_interval_ms?: number;
    ntp_server?: string;
  };
  schedule?: {
    timezone?: string;
    auto_lock_cron?: string;
    auto_unlock_cron?: string;
  };
  // Terminal-specific
  recognition?: {
    face_threshold?: number;
    face_liveness?: boolean;
    face_mask_check?: boolean;
    temperature_check?: boolean;
    temperature_max?: number;
    methods_enabled?: string[];
    multi_factor?: boolean;
  };
  display?: {
    language?: string;
    idle_message?: string;
    logo_url?: string;
    theme?: string;
    screensaver_timeout_ms?: number;
  };
}

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  door_state?: string; // closed, open, held_open, forced, alarm
  location?: string;
  device_id?: string;
  firmware_version?: string;
  site_id?: string;
  last_seen?: string;
  config?: DeviceConfig;
  created_at: string;
  updated_at: string;
}

interface DeviceFormData {
  device_id: string;
  name: string;
  type: string;
  location: string;
  site_id: string;
}

// --- Device history event type rendering config ---

const historyEventConfig: Record<string, { icon: typeof Power; color: string; label: string }> = {
  online:           { icon: Power,          color: 'text-success',          label: 'Online' },
  offline:          { icon: PowerOff,       color: 'text-muted-foreground', label: 'Offline' },
  restart:          { icon: RotateCcw,      color: 'text-operate',          label: 'Restart' },
  emergency:        { icon: ShieldAlert,    color: 'text-error',            label: 'Emergency' },
  sync:             { icon: RefreshCw,      color: 'text-secure',           label: 'Data Sync' },
  config_ack:       { icon: Zap,            color: 'text-manage',           label: 'Config Ack' },
  error:            { icon: AlertTriangle,  color: 'text-warning',          label: 'Error' },
  command:          { icon: Terminal,        color: 'text-secure',           label: 'Command' },
  command_response: { icon: MessageSquare,  color: 'text-success',          label: 'Response' },
  door_command:     { icon: Send,           color: 'text-operate',          label: 'Door Command' },
  door_state:       { icon: DoorOpen,       color: 'text-operate',          label: 'Door State' },
};

const defaultEventCfg = { icon: Zap, color: 'text-muted-foreground', label: 'Event' };

const doorStateConfig: Record<string, { color: string; label: string }> = {
  closed:     { color: 'text-success bg-success/10',          label: 'Closed' },
  open:       { color: 'text-warning bg-warning/10',          label: 'Open' },
  held_open:  { color: 'text-operate bg-operate/10',          label: 'Held Open' },
  held_close: { color: 'text-error bg-error/10',              label: 'Held Close' },
  forced:     { color: 'text-error bg-error/10',              label: 'Forced' },
  alarm:      { color: 'text-error bg-error/10 animate-pulse', label: 'Alarm' },
};

const DEVICE_TYPES = [
  { value: 'terminal', label: 'Terminal', icon: Terminal, color: 'text-cyan-600' },
  { value: 'controller', label: 'Controller', icon: Cpu, color: 'text-purple-600' },
  { value: 'camera', label: 'Camera', icon: Camera, color: 'text-blue-600' },
  { value: 'sensor', label: 'Sensor', icon: Gauge, color: 'text-orange-600' },
] as const;

const RECOGNITION_METHODS = ['face', 'card', 'qr', 'fingerprint', 'pin'];

// --- Helpers ---

function getStatusColor(status: string) {
  switch (status) {
    case 'online': return 'bg-success/10 text-success';
    case 'offline': return 'bg-muted text-muted-foreground';
    case 'warning': return 'bg-warning/10 text-warning';
    default: return 'bg-muted text-muted-foreground';
  }
}

function getTypeIcon(type: string) {
  const dt = DEVICE_TYPES.find(t => t.value === type);
  if (!dt) return <Monitor size={16} className="text-gray-600" />;
  const Icon = dt.icon;
  return <Icon size={16} className={dt.color} />;
}

function defaultConfig(type: string): DeviceConfig {
  const base: DeviceConfig = {
    access_control: {
      mode: 'offline_first',
      door_unlock_duration_ms: 5000,
      max_failed_attempts: 5,
      lockout_duration_ms: 300000,
      anti_passback: false,
      local_db_max_persons: 10000,
    },
    network: {
      heartbeat_interval_ms: 30000,
      offline_queue_max: 5000,
      retry_interval_ms: 5000,
      ntp_server: 'pool.ntp.org',
    },
    schedule: {
      timezone: 'Asia/Ho_Chi_Minh',
      auto_lock_cron: '0 22 * * *',
      auto_unlock_cron: '0 6 * * 1-5',
    },
  };

  if (type === 'terminal') {
    base.recognition = {
      face_threshold: 0.75,
      face_liveness: true,
      face_mask_check: false,
      temperature_check: false,
      temperature_max: 37.5,
      methods_enabled: ['face', 'card'],
      multi_factor: false,
    };
    base.display = {
      language: 'vi',
      idle_message: '',
      logo_url: '',
      theme: 'dark',
      screensaver_timeout_ms: 60000,
    };
  }

  return base;
}

// --- Config Form Components ---

function GeneralConfigSection({ config, onChange, disabled }: {
  config: DeviceConfig;
  onChange: (cfg: DeviceConfig) => void;
  disabled: boolean;
}) {
  const ac = config.access_control ?? {};
  const net = config.network ?? {};
  const sched = config.schedule ?? {};

  return (
    <div className="space-y-6">
      {/* Access Control */}
      <div>
        <h4 className="text-sm font-medium mb-3">Access Control</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cfg-mode">Mode</Label>
            <Select
              data-testid="device-select-access-mode"
              value={ac.mode ?? 'offline_first'}
              onValueChange={(v) => onChange({ ...config, access_control: { ...ac, mode: v } })}
              disabled={disabled}
            >
              <option value="offline_first">Offline First</option>
              <option value="online_only">Online Only</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cfg-unlock-duration">Unlock Duration (ms)</Label>
            <Input
              id="cfg-unlock-duration"
              type="number"
              value={ac.door_unlock_duration_ms ?? 5000}
              onChange={(e) => onChange({ ...config, access_control: { ...ac, door_unlock_duration_ms: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-max-attempts">Max Failed Attempts</Label>
            <Input
              id="cfg-max-attempts"
              type="number"
              value={ac.max_failed_attempts ?? 5}
              onChange={(e) => onChange({ ...config, access_control: { ...ac, max_failed_attempts: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-lockout">Lockout Duration (ms)</Label>
            <Input
              id="cfg-lockout"
              type="number"
              value={ac.lockout_duration_ms ?? 300000}
              onChange={(e) => onChange({ ...config, access_control: { ...ac, lockout_duration_ms: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-max-persons">Max Local Persons</Label>
            <Input
              id="cfg-max-persons"
              type="number"
              value={ac.local_db_max_persons ?? 10000}
              onChange={(e) => onChange({ ...config, access_control: { ...ac, local_db_max_persons: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="cfg-antipassback"
              type="checkbox"
              checked={ac.anti_passback ?? false}
              onChange={(e) => onChange({ ...config, access_control: { ...ac, anti_passback: e.target.checked } })}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="cfg-antipassback">Anti-Passback</Label>
          </div>
        </div>
      </div>

      {/* Network */}
      <div>
        <h4 className="text-sm font-medium mb-3">Network</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cfg-heartbeat">Heartbeat Interval (ms)</Label>
            <Input
              id="cfg-heartbeat"
              type="number"
              value={net.heartbeat_interval_ms ?? 30000}
              onChange={(e) => onChange({ ...config, network: { ...net, heartbeat_interval_ms: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-queue-max">Offline Queue Max</Label>
            <Input
              id="cfg-queue-max"
              type="number"
              value={net.offline_queue_max ?? 5000}
              onChange={(e) => onChange({ ...config, network: { ...net, offline_queue_max: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-retry">Retry Interval (ms)</Label>
            <Input
              id="cfg-retry"
              type="number"
              value={net.retry_interval_ms ?? 5000}
              onChange={(e) => onChange({ ...config, network: { ...net, retry_interval_ms: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-ntp">NTP Server</Label>
            <Input
              id="cfg-ntp"
              value={net.ntp_server ?? 'pool.ntp.org'}
              onChange={(e) => onChange({ ...config, network: { ...net, ntp_server: e.target.value } })}
              disabled={disabled}
            />
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div>
        <h4 className="text-sm font-medium mb-3">Schedule</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cfg-timezone">Timezone</Label>
            <Input
              id="cfg-timezone"
              value={sched.timezone ?? 'Asia/Ho_Chi_Minh'}
              onChange={(e) => onChange({ ...config, schedule: { ...sched, timezone: e.target.value } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-auto-lock">Auto Lock (cron)</Label>
            <Input
              id="cfg-auto-lock"
              value={sched.auto_lock_cron ?? ''}
              onChange={(e) => onChange({ ...config, schedule: { ...sched, auto_lock_cron: e.target.value } })}
              placeholder="0 22 * * *"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-auto-unlock">Auto Unlock (cron)</Label>
            <Input
              id="cfg-auto-unlock"
              value={sched.auto_unlock_cron ?? ''}
              onChange={(e) => onChange({ ...config, schedule: { ...sched, auto_unlock_cron: e.target.value } })}
              placeholder="0 6 * * 1-5"
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalConfigSection({ config, onChange, disabled }: {
  config: DeviceConfig;
  onChange: (cfg: DeviceConfig) => void;
  disabled: boolean;
}) {
  const rec = config.recognition ?? {};
  const disp = config.display ?? {};
  const methods = rec.methods_enabled ?? [];

  const toggleMethod = (method: string) => {
    const updated = methods.includes(method)
      ? methods.filter(m => m !== method)
      : [...methods, method];
    onChange({ ...config, recognition: { ...rec, methods_enabled: updated } });
  };

  return (
    <div className="space-y-6">
      {/* Recognition */}
      <div>
        <h4 className="text-sm font-medium mb-3">Face Recognition</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cfg-threshold">Match Threshold (0.5 - 0.99)</Label>
            <Input
              id="cfg-threshold"
              type="number"
              step="0.01"
              min="0.5"
              max="0.99"
              value={rec.face_threshold ?? 0.75}
              onChange={(e) => onChange({ ...config, recognition: { ...rec, face_threshold: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-temp-max">Temperature Max ({'\u00B0'}C)</Label>
            <Input
              id="cfg-temp-max"
              type="number"
              step="0.1"
              value={rec.temperature_max ?? 37.5}
              onChange={(e) => onChange({ ...config, recognition: { ...rec, temperature_max: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="cfg-liveness"
              type="checkbox"
              checked={rec.face_liveness ?? true}
              onChange={(e) => onChange({ ...config, recognition: { ...rec, face_liveness: e.target.checked } })}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="cfg-liveness">Liveness Detection</Label>
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="cfg-mask"
              type="checkbox"
              checked={rec.face_mask_check ?? false}
              onChange={(e) => onChange({ ...config, recognition: { ...rec, face_mask_check: e.target.checked } })}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="cfg-mask">Mask Check</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="cfg-temp-check"
              type="checkbox"
              checked={rec.temperature_check ?? false}
              onChange={(e) => onChange({ ...config, recognition: { ...rec, temperature_check: e.target.checked } })}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="cfg-temp-check">Temperature Check</Label>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="cfg-mfa"
              type="checkbox"
              checked={rec.multi_factor ?? false}
              onChange={(e) => onChange({ ...config, recognition: { ...rec, multi_factor: e.target.checked } })}
              disabled={disabled}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="cfg-mfa">Multi-Factor</Label>
          </div>
        </div>

        <div className="mt-4">
          <Label>Enabled Methods</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {RECOGNITION_METHODS.map(method => (
              <button
                key={method}
                type="button"
                onClick={() => toggleMethod(method)}
                disabled={disabled}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  methods.includes(method)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                } disabled:opacity-50`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Display */}
      <div>
        <h4 className="text-sm font-medium mb-3">Display</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="cfg-language">Language</Label>
            <Select
              data-testid="device-select-language"
              value={disp.language ?? 'vi'}
              onValueChange={(v) => onChange({ ...config, display: { ...disp, language: v } })}
              disabled={disabled}
            >
              <option value="vi">Vietnamese</option>
              <option value="en">English</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cfg-theme">Theme</Label>
            <Select
              data-testid="device-select-theme"
              value={disp.theme ?? 'dark'}
              onValueChange={(v) => onChange({ ...config, display: { ...disp, theme: v } })}
              disabled={disabled}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="cfg-idle-msg">Idle Message</Label>
            <Input
              id="cfg-idle-msg"
              value={disp.idle_message ?? ''}
              onChange={(e) => onChange({ ...config, display: { ...disp, idle_message: e.target.value } })}
              placeholder="Welcome message"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="cfg-screensaver">Screensaver Timeout (ms)</Label>
            <Input
              id="cfg-screensaver"
              type="number"
              value={disp.screensaver_timeout_ms ?? 60000}
              onChange={(e) => onChange({ ...config, display: { ...disp, screensaver_timeout_ms: Number(e.target.value) } })}
              disabled={disabled}
            />
          </div>
          <div className="col-span-2">
            <Label htmlFor="cfg-logo">Logo URL</Label>
            <Input
              id="cfg-logo"
              value={disp.logo_url ?? ''}
              onChange={(e) => onChange({ ...config, display: { ...disp, logo_url: e.target.value } })}
              placeholder="https://..."
              disabled={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Device History Modal ---

function DeviceHistoryModal({ device, onClose, t }: { device: Device; onClose: () => void; t: (key: string) => string }) {
  const [events, setEvents] = useState<DeviceHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    fetchDeviceHistory(device.id, 1, 50)
      .then((res) => { if (!cancelled) setEvents(res.data || []); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [device.id]);

  return (
    <AppModal
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={
        <span className="inline-flex items-center gap-2">
          <History size={16} /> {t('devices.history.title')} — {device.name || device.device_id || ''}
        </span>
      }
      description={t('devices.history.description')}
      size="2xl"
      showCancelButton
      cancelLabel={t('devices.history.close')}
    >
      {historyLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-5 h-5 border-2 border-secure/30 border-t-secure rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-muted-foreground">
          No history events recorded yet
        </div>
      ) : (
        <div className="space-y-1">
          {events.map((evt) => {
            const cfg = historyEventConfig[evt.event_type] || defaultEventCfg;
            const Icon = cfg.icon;
            return (
              <div
                key={evt.id}
                className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5"
                data-testid={`device-row-history-${evt.id}`}
              >
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-medium uppercase tracking-wider ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {evt.actor_email && (
                      <span className="text-[11px] text-muted-foreground">
                        by {evt.actor_email}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-foreground mt-0.5">{evt.description}</p>
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {new Date(evt.time).toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AppModal>
  );
}

// --- Main Page ---

export function DevicesPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('devices');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  // Modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [formData, setFormData] = useState<DeviceFormData>({
    device_id: '',
    name: '',
    type: 'terminal',
    location: '',
    site_id: '',
  });
  const [editConfig, setEditConfig] = useState<DeviceConfig>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // History modal state
  const [historyDevice, setHistoryDevice] = useState<Device | null>(null);

  // Transmit Data modal state — manual on-demand sync push.
  const [transmitDevice, setTransmitDevice] = useState<Device | null>(null);
  const [transmitTypes, setTransmitTypes] = useState<Record<string, boolean>>({
    config: true,
    person_sync: true,
    access_rules: true,
    blacklist: false,
  });
  const [transmitting, setTransmitting] = useState(false);
  const [transmitJobId, setTransmitJobId] = useState<string | null>(null);
  // Read live job progress from the realtime store. Updates every time a
  // sync.progress WS event arrives for our job.
  const transmitJob = useRealtimeStore((s) => (transmitJobId ? s.syncJobs[transmitJobId] : undefined));

  const openTransmit = (device: Device) => {
    setTransmitDevice(device);
    setTransmitJobId(null);
    setTransmitTypes({ config: true, person_sync: true, access_rules: true, blacklist: false });
  };
  const closeTransmit = () => {
    if (!transmitting) {
      setTransmitDevice(null);
      setTransmitJobId(null);
    }
  };
  const toggleTransmitType = (key: string) =>
    setTransmitTypes((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleTransmit = async () => {
    if (!transmitDevice) return;
    const selected = Object.entries(transmitTypes).filter(([, v]) => v).map(([k]) => k);
    if (selected.length === 0) {
      toast(t('devices.toast.selectOne'), 'error');
      return;
    }
    setTransmitting(true);
    setTransmitJobId(null);
    try {
      const res = await apiFetch<{ results: Record<string, string>; job_id?: string }>(
        `/api/v1/gateway/devices/${transmitDevice.id}/sync?type=${selected.join(',')}`,
        { method: 'POST' },
      );
      if (res.job_id) setTransmitJobId(res.job_id);
      const failed = Object.entries(res.results || {}).filter(([, v]) => v !== 'ok');
      if (failed.length === 0) {
        toast(t('devices.toast.transmitSuccess', { count: selected.length, name: transmitDevice.name || transmitDevice.device_id }), 'success');
      } else {
        toast(t('devices.toast.transmitFailed', { count: failed.length, names: failed.map(([k]) => k).join(', ') }), 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : t('devices.toast.transmitError'), 'error');
    } finally {
      setTransmitting(false);
    }
  };

  // Table state — client-side sort + pagination over the in-memory list.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');

  const handleSortChange = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
    setSortBy(col);
    setSortDir(dir);
    setPage(1);
  }, []);

  const fetchDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Device[]>('/api/v1/gateway/devices');
      setDevices(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch devices';
      setError(message);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const filteredDevices = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return devices.filter(device => {
      const matchesSearch = !q ||
        (device.name ?? '').toLowerCase().includes(q) ||
        (device.location?.toLowerCase() ?? '').includes(q) ||
        (device.device_id?.toLowerCase() ?? '').includes(q);
      const matchesType = filterType === 'all' || device.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [devices, searchTerm, filterType]);

  const sortedDevices = useMemo(() => {
    if (!sortBy || !sortDir) return filteredDevices;
    const dirMul = sortDir === 'asc' ? 1 : -1;
    return [...filteredDevices].sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortBy] ?? '').toLowerCase();
      const bv = String((b as unknown as Record<string, unknown>)[sortBy] ?? '').toLowerCase();
      return av < bv ? -1 * dirMul : av > bv ? 1 * dirMul : 0;
    });
  }, [filteredDevices, sortBy, sortDir]);

  const total = sortedDevices.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedDevices = useMemo(
    () => sortedDevices.slice((page - 1) * pageSize, page * pageSize),
    [sortedDevices, page, pageSize],
  );

  const onlineCount = devices.filter(d => d.status === 'online').length;
  const offlineCount = devices.filter(d => d.status === 'offline').length;
  const warningCount = devices.filter(d => d.status === 'warning').length;

  const deviceColumns = useMemo(
    (): Column<Device>[] => [
      {
        key: 'name',
        header: t('devices.column.device'),
        sortable: true,
        render: (d) => (
          <div className="flex items-center gap-3">
            {getTypeIcon(d.type)}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-medium truncate">{d.name || d.device_id || t('devices.list.unknown')}</span>
              {d.device_id && <span className="text-[11px] font-mono text-muted-foreground truncate">{d.device_id}</span>}
            </div>
          </div>
        ),
      },
      {
        key: 'type',
        header: t('devices.column.type'),
        width: '120px',
        sortable: true,
        render: (d) => (
          <span className="text-[13px]">
            {t(`devices.types.${d.type}`, { defaultValue: d.type })}
          </span>
        ),
      },
      {
        key: 'location',
        header: t('devices.column.location'),
        sortable: true,
        render: (d) => <span className="text-[13px]">{d.location || '—'}</span>,
      },
      {
        key: 'status',
        header: t('devices.column.status'),
        width: '110px',
        sortable: true,
        render: (d) => (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(d.status)}`}>
            {t(`devices.status.${d.status}`, { defaultValue: d.status })}
          </span>
        ),
      },
      {
        key: 'door_state',
        header: t('devices.column.doorState'),
        width: '110px',
        sortable: true,
        render: (d) => {
          if (!d.door_state) return <span className="text-[11px] text-muted-foreground">—</span>;
          const cfg = doorStateConfig[d.door_state] || { color: 'text-muted-foreground bg-muted/60', label: d.door_state };
          return (
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cfg.color}`}>
              {cfg.label}
            </span>
          );
        },
      },
      {
        key: 'firmware_version',
        header: t('devices.column.firmware'),
        width: '120px',
        sortable: true,
        render: (d) => <span className="text-[12px] font-mono text-muted-foreground">{d.firmware_version || '—'}</span>,
      },
      {
        key: 'actions',
        header: t('devices.column.actions'),
        width: '160px',
        render: (d) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              title={t('devices.action.transmit')}
              onClick={() => openTransmit(d)}
              data-testid={`device-button-transmit-${d.device_id || d.id}`}
            >
              <Send size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title={t('devices.action.edit')}
              onClick={() => navigate(`/devices/${d.id}/edit`)}
              data-testid={`device-button-edit-${d.device_id || d.id}`}
            >
              <Edit size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              title={t('devices.action.history')}
              onClick={() => setHistoryDevice(d)}
              data-testid={`device-button-history-${d.device_id || d.id}`}
            >
              <History size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [navigate, t],
  );

  const handleEditOpen = (device: Device) => {
    setEditingDevice(device);
    setFormData({
      device_id: device.device_id || '',
      name: device.name,
      type: device.type,
      location: device.location || '',
      site_id: device.site_id || '',
    });
    setEditConfig(device.config ?? defaultConfig(device.type));
    setFormError('');
    setShowEditModal(true);
  };

  const handleUpdateDevice = async () => {
    if (!editingDevice) return;

    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/gateway/devices/${editingDevice.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.name.trim() || undefined,
          location: formData.location.trim() || undefined,
          site_id: formData.site_id.trim() || undefined,
          config: editConfig,
        }),
      });
      setShowEditModal(false);
      await fetchDevices();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update device');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="text-sm text-muted-foreground">{t('devices.list.loading')}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={() => window.location.reload()}>{t('devices.list.retry')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-semibold">{t('devices.management.title')}</h1>
          <p className="text-muted-foreground">{t('devices.management.description')}</p>
        </div>
{/* Add Device is only available on /system/devices for system admins */}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{devices.length}</div>
                <div className="text-sm text-muted-foreground">{t('devices.stats.total')}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{onlineCount}</div>
                <div className="text-sm text-muted-foreground">{t('devices.stats.online')}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-yellow-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{warningCount}</div>
                <div className="text-sm text-muted-foreground">{t('devices.stats.warning')}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-gray-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">{offlineCount}</div>
                <div className="text-sm text-muted-foreground">{t('devices.stats.offline')}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4 shrink-0">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder={t('devices.list.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="device-input-search"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            onClick={() => setFilterType('all')}
          >
            {t('devices.list.filterAll')}
          </Button>
          {DEVICE_TYPES.map(dt => {
            const Icon = dt.icon;
            return (
              <Button
                key={dt.value}
                variant={filterType === dt.value ? 'default' : 'outline'}
                onClick={() => setFilterType(dt.value)}
              >
                <Icon size={16} className="mr-2" />
                {t(`devices.types.${dt.value}`, { defaultValue: dt.label })}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Devices Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={loading}
            columns={deviceColumns}
            data={pagedDevices}
            rowKey={(d) => d.id}
            sortState={{ col: sortBy, dir: sortDir }}
            onSortChange={handleSortChange}
            onRowDoubleClick={(d) => navigate(`/devices/${d.id}/edit`)}
            emptyMessage={searchTerm ? t('devices.list.emptySearch') : t('devices.list.empty')}
            emptyIcon={<Monitor size={32} strokeWidth={1.2} />}
          />
        </div>
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          total={total}
          totalPages={totalPages}
          pageSizeOptions={[10, 20, 50, 100]}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          loading={loading}
          sortColumns={[
            { value: 'name', label: 'Device' },
            { value: 'type', label: 'Type' },
            { value: 'location', label: 'Location' },
            { value: 'status', label: 'Status' },
            { value: 'firmware_version', label: 'Firmware' },
          ]}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={handleSortChange}
        />
      </div>

      {/* Edit Device Modal */}
      <AppModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        title={`Edit Device — ${editingDevice?.name || editingDevice?.device_id || ''}`}
        size="lg"
        showCancelButton
        cancelLabel="Cancel"
        errorMessage={formError || undefined}
        primaryAction={{
          label: submitting ? 'Saving...' : 'Save',
          onClick: handleUpdateDevice,
          disabled: submitting,
          loading: submitting,
        }}
      >
        <Tabs defaultValue="general" className="w-full">
          <TabsList>
            <TabsTrigger value="general">Device Info</TabsTrigger>
            <TabsTrigger value="config">General Config</TabsTrigger>
            {editingDevice?.type === 'terminal' && (
              <TabsTrigger value="terminal">Terminal Config</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general">
            <div className="space-y-4 pt-4">
              <div>
                <Label>Device ID</Label>
                <Input value={formData.device_id} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Type</Label>
                <Input value={formData.type} disabled className="bg-muted capitalize" />
              </div>
              <div>
                <Label htmlFor="edit-name">Device Name</Label>
                <Input
                  id="edit-name"
                  data-testid="device-input-edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Display name"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label htmlFor="edit-location">Location</Label>
                <Input
                  id="edit-location"
                  data-testid="device-input-edit-location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Main Entrance"
                  disabled={submitting}
                />
              </div>
              <div>
                <Label htmlFor="edit-site">Site ID</Label>
                <Input
                  id="edit-site"
                  data-testid="device-input-edit-site-id"
                  value={formData.site_id}
                  onChange={(e) => setFormData({ ...formData, site_id: e.target.value })}
                  placeholder="Site identifier"
                  disabled={submitting}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="config">
            <div className="pt-4">
              <GeneralConfigSection config={editConfig} onChange={setEditConfig} disabled={submitting} />
            </div>
          </TabsContent>

          {editingDevice?.type === 'terminal' && (
            <TabsContent value="terminal">
              <div className="pt-4">
                <TerminalConfigSection config={editConfig} onChange={setEditConfig} disabled={submitting} />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </AppModal>

      {/* Transmit Data modal */}
      <AppModal
        open={!!transmitDevice}
        onOpenChange={(v) => { if (!v) closeTransmit(); }}
        title={
          <span className="flex items-center gap-2">
            <Send size={16} /> {t('devices.transmit.title')} — {transmitDevice?.name || transmitDevice?.device_id || ''}
          </span>
        }
        size="sm"
        showCancelButton
        cancelLabel={transmitJob && transmitJob.finished_at ? t('devices.transmit.action.close') : t('devices.transmit.action.cancel')}
        cancelDisabled={transmitting}
        primaryAction={{
          label: transmitting ? t('devices.transmit.action.submitting') : t('devices.transmit.action.submit'),
          onClick: handleTransmit,
          disabled: transmitting,
          loading: transmitting,
        }}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-muted-foreground">
              {t('devices.transmit.description')}
            </p>
            {(() => {
              const keys = ['config', 'person_sync', 'access_rules', 'blacklist'];
              const allOn = keys.every((k) => transmitTypes[k]);
              return (
                <button
                  type="button"
                  onClick={() => {
                    const next: Record<string, boolean> = {};
                    for (const k of keys) next[k] = !allOn;
                    setTransmitTypes(next);
                  }}
                  disabled={transmitting}
                  className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                >
                  {allOn ? t('devices.transmit.deselectAll') : t('devices.transmit.selectAll')}
                </button>
              );
            })()}
          </div>
          {[
            { key: 'config', label: t('devices.transmit.item.config.label'), desc: t('devices.transmit.item.config.desc') },
            { key: 'person_sync', label: t('devices.transmit.item.person_sync.label'), desc: t('devices.transmit.item.person_sync.desc') },
            { key: 'access_rules', label: t('devices.transmit.item.access_rules.label'), desc: t('devices.transmit.item.access_rules.desc') },
            { key: 'blacklist', label: t('devices.transmit.item.blacklist.label'), desc: t('devices.transmit.item.blacklist.desc') },
          ].map(({ key, label, desc }) => {
            const stat = transmitJob?.per_type?.[key];
            const checked = !!transmitTypes[key];
            // Progress reflects max(published, acked). Firmware that doesn't
            // echo job_id back will keep `acked` at 0, so we show "Sent" as
            // success and surface the acked count separately when it arrives.
            const progress = stat ? Math.max(stat.published, stat.acked) : 0;
            const pct = stat && stat.total > 0 ? Math.min(100, (progress / stat.total) * 100) : 0;
            return (
              <label
                key={key}
                className="flex items-start gap-2.5 rounded-md border border-border bg-card p-2.5 cursor-pointer hover:border-ring/40 transition-colors"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleTransmitType(key)}
                  disabled={transmitting || !!transmitJob}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[13px] font-medium text-foreground">{label}</div>
                    {stat && (
                      <span className={`text-[10px] font-medium ${
                        stat.status === 'error' ? 'text-destructive' :
                        stat.status === 'ok' ? 'text-emerald-500' :
                        stat.status === 'publishing' ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {stat.status === 'error' ? t('devices.transmit.status.failed') :
                         stat.status === 'ok' ? (stat.acked >= stat.total ? t('devices.transmit.status.acked') : t('devices.transmit.status.sent')) :
                         stat.status === 'publishing' ? `${progress}/${stat.total}` : t('devices.transmit.status.pending')}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{desc}</div>
                  {stat && stat.error && (
                    <div className="text-[11px] text-destructive mt-1 truncate" title={stat.error}>{stat.error}</div>
                  )}
                  {stat && stat.total > 0 && (
                    <div className="mt-1.5 h-1 rounded bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${stat.status === 'error' ? 'bg-destructive' : stat.status === 'ok' ? 'bg-emerald-500' : 'bg-primary'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              </label>
            );
          })}
          {transmitJob && (() => {
            const progress = Math.max(transmitJob.published, transmitJob.acked);
            const pct = transmitJob.total > 0 ? Math.min(100, (progress / transmitJob.total) * 100) : 0;
            return (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-foreground">{t('devices.transmit.overall')}</span>
                  <span className="font-mono text-muted-foreground">
                    {Math.round(pct)}%
                    <span className="ml-1.5 opacity-60">
                      ({progress}/{transmitJob.total} {t('devices.transmit.msgsLabel')}
                      {transmitJob.acked > 0 && transmitJob.acked < transmitJob.published && `, ${t('devices.transmit.ackedSuffix', { count: transmitJob.acked })}`})
                    </span>
                  </span>
                </div>
                <div className="h-1.5 rounded bg-muted overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${transmitJob.errors && transmitJob.errors.length > 0 ? 'bg-destructive' : transmitJob.finished_at ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {transmitJob.acked === 0 && transmitJob.finished_at && (
                  <div className="text-[11px] text-muted-foreground">
                    {t('devices.transmit.ackHint')}
                  </div>
                )}
                {transmitJob.errors && transmitJob.errors.length > 0 && (
                  <div className="text-[11px] text-destructive">
                    {transmitJob.errors.map((e, i) => <div key={i}>• {e}</div>)}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </AppModal>

      {/* ── Device History Modal ──────────────────────────────── */}
      {historyDevice && (
        <DeviceHistoryModal
          device={historyDevice}
          onClose={() => setHistoryDevice(null)}
          t={t}
        />
      )}

    </div>
  );
}
