import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Monitor, Camera, Cpu, Settings, Terminal, Gauge, Edit } from 'lucide-react';
import { Button, Card, CardContent, Input, AppModal, Label, Select, Tabs, TabsList, TabsTrigger, TabsContent, DataTable, type Column, TablePaginationFooter } from '@dm3/ui';
import { apiFetch } from '@/lib/api';

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

// --- Main Page ---

export function DevicesPage() {
  const navigate = useNavigate();
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
        header: 'Device',
        sortable: true,
        render: (d) => (
          <div className="flex items-center gap-3">
            {getTypeIcon(d.type)}
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-medium truncate">{d.name || d.device_id || 'Unknown Device'}</span>
              {d.device_id && <span className="text-[11px] font-mono text-muted-foreground truncate">{d.device_id}</span>}
            </div>
          </div>
        ),
      },
      {
        key: 'type',
        header: 'Type',
        width: '120px',
        sortable: true,
        render: (d) => <span className="text-[13px] capitalize">{d.type}</span>,
      },
      {
        key: 'location',
        header: 'Location',
        sortable: true,
        render: (d) => <span className="text-[13px]">{d.location || '—'}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        width: '110px',
        sortable: true,
        render: (d) => (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusColor(d.status)}`}>
            {d.status}
          </span>
        ),
      },
      {
        key: 'firmware_version',
        header: 'Firmware',
        width: '120px',
        sortable: true,
        render: (d) => <span className="text-[12px] font-mono text-muted-foreground">{d.firmware_version || '—'}</span>,
      },
      {
        key: 'actions',
        header: 'Actions',
        width: '88px',
        render: (d) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              title="Edit"
              onClick={() => navigate(`/devices/${d.id}/edit`)}
              data-testid={`device-button-edit-${d.device_id || d.id}`}
            >
              <Edit size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [navigate],
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
          <p className="text-sm text-muted-foreground">Loading devices...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Device Management</h1>
          <p className="text-muted-foreground">Monitor and manage security devices</p>
        </div>
{/* Add Device is only available on /system/devices for system admins */}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                <Monitor size={20} className="text-primary" />
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{devices.length}</div>
                <div className="text-sm text-muted-foreground">Total Devices</div>
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
                <div className="text-sm text-muted-foreground">Online</div>
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
                <div className="text-sm text-muted-foreground">Warning</div>
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
                <div className="text-sm text-muted-foreground">Offline</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <div className="flex gap-4">
        <div className="flex-1 relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search devices by name or location..."
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
            All
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
                {dt.label}s
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
            emptyMessage={searchTerm ? 'No devices match your search' : 'No devices found'}
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

    </div>
  );
}
