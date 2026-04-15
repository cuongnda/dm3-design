import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Terminal, Cpu, Camera, Gauge, Monitor, Settings2, Search, ShieldCheck } from 'lucide-react';
import { apiFetch, fetchCompanies, type CompanyDTO } from '@/lib/api';
import { DEVICE_TYPE_MODELS, VERIFY_METHODS, getModelCapabilities, type VerifyMethodValue } from '@/lib/device-models';
import { Button, Input, Select, Label } from '@dm3/ui';
import ErrorBoundary from '@/components/ErrorBoundary';

// --- Constants ---

const DEVICE_TYPE_KEYS = [
  { value: 'terminal', icon: Terminal, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30' },
  { value: 'controller', icon: Cpu, color: 'text-purple-500 bg-purple-500/10 border-purple-500/30' },
  { value: 'camera', icon: Camera, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
  { value: 'sensor', icon: Gauge, color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
] as const;

const TIMEZONES = [
  'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Jakarta', 'Asia/Manila',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
  'UTC',
];

// --- Types ---

interface DeviceConfig {
  model?: string;
  open_relay_ms?: number;
  timezone?: string;
  verify_methods?: VerifyMethodValue[];
  verify_logic?: 'or' | 'and';
}

function defaultConfig(): DeviceConfig {
  return { model: '', open_relay_ms: 3000, timezone: 'Asia/Ho_Chi_Minh', verify_methods: [], verify_logic: 'or' };
}

// Camera-specific provisioning state. Sent as the top-level `camera` object
// to the gateway when type === 'camera'. Defaults mirror backend defaults.
interface CameraState {
  rtsp_url: string;
  rtsp_username: string;
  rtsp_password: string;
  brand: string;
  recording_mode: 'event_only' | 'disabled';
  pre_roll_sec: number;
  post_roll_sec: number;
}

function defaultCamera(): CameraState {
  return { rtsp_url: '', rtsp_username: '', rtsp_password: '', brand: '', recording_mode: 'event_only', pre_roll_sec: 10, post_roll_sec: 20 };
}

// --- Reusable components ---

function Section({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg bg-card">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border">
        <div className="w-8 h-8 rounded-md bg-operate/10 flex items-center justify-center">
          <Icon size={16} className="text-operate" />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function TimezoneSelect({ value, onChange, disabled, placeholder, noMatch }: { value: string; onChange: (v: string) => void; disabled: boolean; placeholder: string; noMatch: string }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!search) return TIMEZONES;
    const q = search.toLowerCase();
    return TIMEZONES.filter(tz => tz.toLowerCase().includes(q));
  }, [search]);

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          value={open ? search : value}
          onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setSearch(''); }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 mt-1"
        />
      </div>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-auto bg-popover border border-border rounded-md shadow-lg">
            {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-foreground">{noMatch}</div>}
            {filtered.map(tz => (
              <button key={tz} type="button"
                onClick={() => { onChange(tz); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-accent transition-colors ${tz === value ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground'}`}>
                {tz}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// --- Main page ---

function CreateDevicePageContent() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdName, setCreatedName] = useState('');

  const [form, setForm] = useState({ device_id: '', name: '', type: 'terminal', tenant_id: '', location: '' });
  const [config, setConfig] = useState<DeviceConfig>(defaultConfig());
  const [camera, setCamera] = useState<CameraState>(defaultCamera());

  useEffect(() => {
    fetchCompanies().then(setCompanies).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const handleTypeChange = (type: string) => { setForm(prev => ({ ...prev, type })); setConfig(defaultConfig()); setCamera(defaultCamera()); };

  // Models for the selected device type
  const modelsForType = DEVICE_TYPE_MODELS[form.type] ?? [];

  // Capabilities for the selected model
  const capabilities = useMemo(() => getModelCapabilities(config.model ?? ''), [config.model]);
  const selectedMethods = config.verify_methods ?? [];

  // When model changes, reset verify methods to only keep valid ones
  const handleModelChange = (model: string) => {
    const caps = getModelCapabilities(model);
    setConfig(c => ({
      ...c,
      model,
      verify_methods: (c.verify_methods ?? []).filter(m => caps.includes(m)),
    }));
  };

  const toggleMethod = (method: VerifyMethodValue) => {
    setConfig(c => {
      const current = c.verify_methods ?? [];
      const updated = current.includes(method)
        ? current.filter(m => m !== method)
        : [...current, method];
      return { ...c, verify_methods: updated };
    });
  };

  const isCamera = form.type === 'camera';
  const isFormValid = Boolean(
    form.device_id.trim() && form.type && form.tenant_id &&
    (!isCamera || camera.rtsp_url.trim()),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        device_id: form.device_id.trim(),
        name: form.name.trim() || undefined,
        type: form.type,
        tenant_id: form.tenant_id,
        location: form.location.trim() || undefined,
        config,
      };
      if (isCamera) {
        body.camera = {
          rtsp_url: camera.rtsp_url.trim(),
          rtsp_username: camera.rtsp_username.trim() || undefined,
          rtsp_password: camera.rtsp_password || undefined,
          brand: camera.brand.trim() || undefined,
          recording_mode: camera.recording_mode,
          pre_roll_sec: camera.pre_roll_sec,
          post_roll_sec: camera.post_roll_sec,
        };
      }
      await apiFetch('/api/v1/gateway/devices/provision', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreatedName(form.name || form.device_id);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create device');
    } finally {
      setLoading(false);
    }
  };

  // --- Success ---
  if (success) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-16">
        <div className="border border-border rounded-xl p-8 bg-card text-center">
          <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-5">
            <Check size={28} className="text-success" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">{t('createDevice.success.title')}</h2>
          <p className="text-[13px] text-muted-foreground mb-2">
            <span className="text-foreground font-medium">{createdName}</span> {t('createDevice.success.message')}
          </p>
          <p className="text-[12px] text-muted-foreground mb-6">
            {t('createDevice.success.offlineHint')}
          </p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => { setSuccess(false); setForm({ device_id: '', name: '', type: 'terminal', tenant_id: '', location: '' }); setConfig(defaultConfig()); setCamera(defaultCamera()); }}>
              {t('createDevice.success.addAnother')}
            </Button>
            <Button className="flex-1 bg-operate hover:bg-operate/90 text-white" onClick={() => navigate('/system/devices')}>
              {t('createDevice.success.goToDevices')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Form ---
  return (
    <div className="p-6 max-w-3xl">
      <Button data-testid="sysdevice-button-back" variant="ghost" size="sm" onClick={() => navigate('/system/devices')} className="mb-4 text-muted-foreground hover:text-foreground gap-1">
        <ArrowLeft size={15} /> {t('createDevice.backToDevices')}
      </Button>

      <div className="mb-8">
        <h1 className="text-xl font-semibold text-foreground">{t('createDevice.title')}</h1>
        <p className="text-[13px] text-muted-foreground mt-1">{t('createDevice.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div data-testid="sysdevice-text-error" className="px-4 py-3 bg-error/10 border border-error/30 rounded-lg text-error text-[13px]">{error}</div>
        )}

        {/* Device Type */}
        <div>
          <Label className="text-[13px] font-medium mb-3 block">{t('createDevice.deviceType')} *</Label>
          <div className="grid grid-cols-4 gap-3">
            {DEVICE_TYPE_KEYS.map(dt => {
              const Icon = dt.icon;
              const selected = form.type === dt.value;
              return (
                <button key={dt.value} type="button" onClick={() => handleTypeChange(dt.value)} disabled={loading}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all cursor-pointer disabled:opacity-50
                    ${selected ? 'border-operate bg-operate/5 shadow-sm' : 'border-border bg-card hover:border-muted-foreground/50'}`}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${dt.color}`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-[13px] font-medium text-foreground">{t(`createDevice.type.${dt.value}`)}</span>
                  <span className="text-[11px] text-muted-foreground text-center leading-tight">{t(`createDevice.type.${dt.value}.desc`)}</span>
                  {selected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-operate flex items-center justify-center">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Device Info */}
        <Section icon={Monitor} title={t('createDevice.info.title')} desc={t('createDevice.info.desc')}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px]">{t('createDevice.info.deviceId')} *</Label>
                <Input data-testid="sysdevice-input-device-id" required value={form.device_id} onChange={(e) => set('device_id', e.target.value)} placeholder="e.g., 000001" disabled={loading} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">{t('createDevice.info.deviceIdHint')}</p>
              </div>
              <div>
                <Label className="text-[12px]">{t('createDevice.info.company')} *</Label>
                <Select data-testid="sysdevice-select-company" value={form.tenant_id} onValueChange={(v) => set('tenant_id', v)} disabled={loading} placeholder={t('createDevice.info.companyPlaceholder')} className="mt-1">
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[12px]">{t('createDevice.info.name')}</Label>
              <Input data-testid="sysdevice-input-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('createDevice.info.namePlaceholder')} disabled={loading} className="mt-1" />
            </div>
            <div>
              <Label className="text-[12px]">{t('createDevice.info.location')}</Label>
              <Input data-testid="sysdevice-input-location" value={form.location} onChange={(e) => set('location', e.target.value)} placeholder={t('createDevice.info.locationPlaceholder')} disabled={loading} className="mt-1" />
            </div>
          </div>
        </Section>

        {/* Camera (only when type=camera). Creates the dm3_cctv.cameras row
            atomically with the device row so Devices and CCTV pages stay in
            sync — same asymmetry would otherwise leave orphan rows. */}
        {isCamera && (
          <Section icon={Camera} title="Camera / RTSP" desc="Connection details for the camera stream. The password is encrypted at rest.">
            <div className="space-y-4">
              <div>
                <Label className="text-[12px]">RTSP URL *</Label>
                <Input
                  data-testid="sysdevice-input-rtsp-url"
                  required
                  value={camera.rtsp_url}
                  onChange={(e) => setCamera(c => ({ ...c, rtsp_url: e.target.value }))}
                  placeholder="rtsp://192.168.1.100:554/Streaming/Channels/101"
                  disabled={loading}
                  className="mt-1 font-mono text-[12px]"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Must be an rtsp:// or rtsps:// URL reachable from the cctv-svc container.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-[12px]">RTSP Username</Label>
                  <Input
                    data-testid="sysdevice-input-rtsp-username"
                    value={camera.rtsp_username}
                    onChange={(e) => setCamera(c => ({ ...c, rtsp_username: e.target.value }))}
                    placeholder="admin"
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">RTSP Password</Label>
                  <Input
                    data-testid="sysdevice-input-rtsp-password"
                    type="password"
                    value={camera.rtsp_password}
                    onChange={(e) => setCamera(c => ({ ...c, rtsp_password: e.target.value }))}
                    placeholder="••••••••"
                    disabled={loading}
                    className="mt-1"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-[12px]">Brand</Label>
                  <Input
                    data-testid="sysdevice-input-camera-brand"
                    value={camera.brand}
                    onChange={(e) => setCamera(c => ({ ...c, brand: e.target.value }))}
                    placeholder="Hikvision, Dahua, …"
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-[12px]">Recording Mode</Label>
                  <Select
                    data-testid="sysdevice-select-recording-mode"
                    value={camera.recording_mode}
                    onValueChange={(v) => setCamera(c => ({ ...c, recording_mode: v as 'event_only' | 'disabled' }))}
                    disabled={loading}
                    className="mt-1"
                  >
                    <option value="event_only">Event only</option>
                    <option value="disabled">Disabled</option>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[12px]">Pre-roll (s)</Label>
                    <Input
                      data-testid="sysdevice-input-pre-roll"
                      type="number"
                      min={0}
                      max={60}
                      value={camera.pre_roll_sec}
                      onChange={(e) => setCamera(c => ({ ...c, pre_roll_sec: Number(e.target.value) }))}
                      disabled={loading}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[12px]">Post-roll (s)</Label>
                    <Input
                      data-testid="sysdevice-input-post-roll"
                      type="number"
                      min={0}
                      max={120}
                      value={camera.post_roll_sec}
                      onChange={(e) => setCamera(c => ({ ...c, post_roll_sec: Number(e.target.value) }))}
                      disabled={loading}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Device Config */}
        <Section icon={Settings2} title={t('createDevice.config.title')} desc={t('createDevice.config.desc')}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px]">{t('createDevice.config.model')} *</Label>
                <Select data-testid="sysdevice-select-model" value={config.model ?? ''} onValueChange={handleModelChange} disabled={loading} placeholder={t('createDevice.config.modelPlaceholder')} className="mt-1">
                  {modelsForType.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">{t('createDevice.config.modelHint')}</p>
              </div>
              <div>
                <Label className="text-[12px]">{t('createDevice.config.openRelay')}</Label>
                <Input type="number" min={1} max={30} value={(config.open_relay_ms ?? 3000) / 1000} onChange={(e) => setConfig(c => ({ ...c, open_relay_ms: Number(e.target.value) * 1000 }))} disabled={loading} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">{t('createDevice.config.openRelayHint')}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px]">{t('createDevice.config.ipAddress')}</Label>
                <Input value="" disabled placeholder={t('createDevice.config.ipPlaceholder')} className="mt-1 bg-muted" />
              </div>
              <div>
                <Label className="text-[12px]">{t('createDevice.config.macAddress')}</Label>
                <Input value="" disabled placeholder={t('createDevice.config.macPlaceholder')} className="mt-1 bg-muted" />
              </div>
            </div>

            <div>
              <Label className="text-[12px]">{t('createDevice.config.timezone')}</Label>
              <TimezoneSelect
                value={config.timezone ?? 'Asia/Ho_Chi_Minh'}
                onChange={(v) => setConfig(c => ({ ...c, timezone: v }))}
                disabled={loading}
                placeholder={t('createDevice.config.timezonePlaceholder')}
                noMatch={t('createDevice.config.timezoneNoMatch')}
              />
            </div>
          </div>
        </Section>

        {/* Verify Mode — only when model is selected and has capabilities */}
        {config.model && capabilities.length > 0 && (
          <Section icon={ShieldCheck} title={t('createDevice.verify.title')} desc={t('createDevice.verify.desc')}>
            <div className="space-y-4">
              {/* AND / OR toggle */}
              <div>
                <Label className="text-[12px] mb-2 block">{t('createDevice.verify.logic')}</Label>
                <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                  <button type="button" onClick={() => setConfig(c => ({ ...c, verify_logic: 'or' }))} disabled={loading}
                    className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-all ${config.verify_logic === 'or' ? 'bg-operate text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {t('createDevice.verify.or')}
                  </button>
                  <button type="button" onClick={() => setConfig(c => ({ ...c, verify_logic: 'and' }))} disabled={loading}
                    className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-all ${config.verify_logic === 'and' ? 'bg-operate text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {t('createDevice.verify.and')}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {config.verify_logic === 'or' ? t('createDevice.verify.orHint') : t('createDevice.verify.andHint')}
                </p>
              </div>

              {/* Method grid */}
              <div>
                <Label className="text-[12px] mb-2 block">{t('createDevice.verify.methods')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {VERIFY_METHODS.map(method => {
                    const supported = capabilities.includes(method.value);
                    const active = selectedMethods.includes(method.value);
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => supported && toggleMethod(method.value)}
                        disabled={loading || !supported}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all
                          ${!supported
                            ? 'opacity-40 cursor-not-allowed border-border bg-muted/50'
                            : active
                              ? 'border-operate bg-operate/5 shadow-sm'
                              : 'border-border bg-card hover:border-muted-foreground/50 cursor-pointer'
                          }`}
                      >
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 transition-colors
                          ${active ? 'bg-operate/10' : 'bg-muted'}`}>
                          <Icon size={16} className={active ? 'text-operate' : 'text-muted-foreground'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[12px] font-medium text-foreground">{t(`createDevice.verify.method.${method.value}`)}</span>
                          {!supported && <span className="block text-[10px] text-muted-foreground">{t('createDevice.verify.notSupported')}</span>}
                        </div>
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                          ${active ? 'bg-operate border-operate' : 'border-border bg-card'}`}>
                          {active && <Check size={12} className="text-white" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Summary */}
              {selectedMethods.length > 0 && (
                <div className="bg-muted/50 rounded-lg px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">
                    {t('createDevice.verify.summary')}{' '}
                    <span className="text-foreground font-medium">
                      {selectedMethods.map(m => t(`createDevice.verify.method.${m}`)).join(
                        config.verify_logic === 'and' ? ` ${t('createDevice.verify.and')} ` : ` ${t('createDevice.verify.or')} `
                      )}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* No verify hint for sensor/reader */}
        {config.model && capabilities.length === 0 && (
          <div className="border border-border rounded-lg bg-muted/30 px-5 py-4">
            <div className="flex items-center gap-3">
              <ShieldCheck size={16} className="text-muted-foreground" />
              <p className="text-[12px] text-muted-foreground">{t('createDevice.verify.noMethods')}</p>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="pt-2 pb-8">
          <Button data-testid="sysdevice-button-submit" type="submit" disabled={loading || !isFormValid} className="w-full h-11 bg-operate hover:bg-operate/90 text-white font-medium text-[14px]">
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                {t('createDevice.submitting')}
              </span>
            ) : t('createDevice.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function CreateDevicePage() {
  return (
    <ErrorBoundary onError={(error, errorInfo) => { console.error('CreateDevicePage Error:', error, errorInfo); }}>
      <CreateDevicePageContent />
    </ErrorBoundary>
  );
}
