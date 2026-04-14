import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Terminal, Cpu, Camera, Gauge, Monitor, Settings2, Search, ShieldCheck, Save, X } from 'lucide-react';
import { fetchSystemDevice, updateSystemDevice, fetchDevice, updateDevice, fetchCompanies, type CompanyDTO } from '@/lib/api';
import { DEVICE_TYPE_MODELS, VERIFY_METHODS, getModelCapabilities, type VerifyMethodValue } from '@/lib/device-models';
import { Button, Input, Select, Label } from '@dm3/ui';
import { toast } from '@/lib/toast';
import ErrorBoundary from '@/components/ErrorBoundary';

const DEVICE_TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  terminal: { icon: Terminal, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30' },
  controller: { icon: Cpu, color: 'text-purple-500 bg-purple-500/10 border-purple-500/30' },
  camera: { icon: Camera, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
  sensor: { icon: Gauge, color: 'text-orange-500 bg-orange-500/10 border-orange-500/30' },
};

const TIMEZONES = [
  'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Jakarta', 'Asia/Manila',
  'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Europe/Moscow', 'America/New_York', 'America/Chicago', 'America/Denver',
  'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
  'UTC',
];

interface DeviceConfig {
  model?: string;
  open_relay_ms?: number;
  timezone?: string;
  verify_methods?: VerifyMethodValue[];
  verify_logic?: 'or' | 'and';
}

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

interface EditDevicePageProps {
  /**
   * When true (default), loads and saves via the system-admin endpoints
   * (`/system/devices/:id`) and navigates back to `/system/devices`.
   * When false, uses the company-scoped endpoints (`/devices/:id`) and
   * navigates back to `/devices`. Both share the same form — the
   * backend UpdateDevice handler accepts the same fields either way.
   */
  isSystemAdmin?: boolean;
}

function EditDevicePageContent({ isSystemAdmin = true }: EditDevicePageProps) {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation('system');
  const loadDevice = isSystemAdmin ? fetchSystemDevice : fetchDevice;
  const saveDevice = isSystemAdmin ? updateSystemDevice : updateDevice;
  const listPath = isSystemAdmin ? '/system/devices' : '/devices';

  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [error, setError] = useState('');

  // Immutable identity — shown read-only.
  const [identity, setIdentity] = useState({ device_id: '', type: '', tenant_id: '' });
  // Editable fields.
  const [form, setForm] = useState({ name: '', location: '' });
  const [config, setConfig] = useState<DeviceConfig>({ model: '', open_relay_ms: 3000, timezone: 'Asia/Ho_Chi_Minh', verify_methods: [], verify_logic: 'or' });

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [device, comps] = await Promise.all([
          loadDevice(id),
          isSystemAdmin ? fetchCompanies() : Promise.resolve([] as CompanyDTO[]),
        ]);
        if (cancelled) return;
        setCompanies(comps);
        setIdentity({
          device_id: device.device_id ?? '',
          type: device.type ?? '',
          tenant_id: device.tenant_id ?? '',
        });
        setForm({
          name: device.name ?? '',
          location: device.location ?? '',
        });
        setConfig({
          model: device.model ?? '',
          open_relay_ms: device.open_relay_ms ?? 3000,
          timezone: device.timezone ?? 'Asia/Ho_Chi_Minh',
          verify_methods: (device.verify_methods ?? []) as VerifyMethodValue[],
          verify_logic: (device.verify_logic === 'and' ? 'and' : 'or'),
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('editDevice.error.loadFailed'));
      } finally {
        if (!cancelled) setLoadingInitial(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, isSystemAdmin]);

  const modelsForType = DEVICE_TYPE_MODELS[identity.type] ?? [];
  const capabilities = useMemo(() => getModelCapabilities(config.model ?? ''), [config.model]);
  const selectedMethods = config.verify_methods ?? [];

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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      await saveDevice(id, {
        name: form.name.trim(),
        location: form.location.trim(),
        model: config.model || null,
        open_relay_ms: config.open_relay_ms,
        timezone: config.timezone,
        verify_methods: config.verify_methods ?? [],
        verify_logic: config.verify_logic,
      });
      toast(t('editDevice.success.message'), 'success');
      navigate(listPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('editDevice.error.updateFailed');
      setError(message);
      toast(message, 'error');
      setLoading(false);
    }
  };

  if (loadingInitial) {
    return (
      <div className="p-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-operate/30 border-t-operate mx-auto mt-16" />
      </div>
    );
  }

  const typeIcon = DEVICE_TYPE_ICONS[identity.type] ?? DEVICE_TYPE_ICONS.terminal;
  const TypeIcon = typeIcon.icon;
  const companyName = companies.find(c => c.id === identity.tenant_id)?.name ?? identity.tenant_id;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 max-w-3xl">
      <Button data-testid="editdevice-button-back" variant="ghost" size="sm" onClick={() => navigate(listPath)} className="mb-4 text-muted-foreground hover:text-foreground gap-1">
        <ArrowLeft size={15} /> {t('createDevice.backToDevices')}
      </Button>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t('editDevice.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{t('editDevice.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => navigate(listPath)} disabled={loading} data-testid="editdevice-button-cancel">
            <X size={14} className="mr-1.5" /> {t('editDevice.cancel')}
          </Button>
          <Button size="sm" onClick={() => handleSubmit()} disabled={loading} data-testid="editdevice-button-save">
            <Save size={14} className="mr-1.5" />
            {loading ? t('editDevice.saving') : t('editDevice.save')}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div data-testid="editdevice-text-error" className="px-4 py-3 bg-error/10 border border-error/30 rounded-lg text-error text-[13px]">{error}</div>
        )}

        {/* Read-only identity block */}
        <div className="border border-border rounded-lg bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${typeIcon.color}`}>
              <TypeIcon size={22} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('createDevice.info.deviceId')}</div>
              <div className="text-[14px] font-mono font-medium text-foreground">{identity.device_id}</div>
            </div>
            {isSystemAdmin && (
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('createDevice.info.company')}</div>
                <div className="text-[13px] text-foreground">{companyName || '—'}</div>
              </div>
            )}
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('createDevice.deviceType')}</div>
              <div className="text-[13px] text-foreground capitalize">{identity.type}</div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            {t('editDevice.identityLocked')}
          </p>
        </div>

        {/* Device Info */}
        <Section icon={Monitor} title={t('createDevice.info.title')} desc={t('createDevice.info.desc')}>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]">{t('createDevice.info.name')}</Label>
              <Input data-testid="editdevice-input-name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('createDevice.info.namePlaceholder')} disabled={loading} className="mt-1" />
            </div>
            <div>
              <Label className="text-[12px]">{t('createDevice.info.location')}</Label>
              <Input data-testid="editdevice-input-location" value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} placeholder={t('createDevice.info.locationPlaceholder')} disabled={loading} className="mt-1" />
            </div>
          </div>
        </Section>

        {/* Device Config */}
        <Section icon={Settings2} title={t('createDevice.config.title')} desc={t('createDevice.config.desc')}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[12px]">{t('createDevice.config.model')} *</Label>
                <Select data-testid="editdevice-select-model" value={config.model ?? ''} onValueChange={handleModelChange} disabled={loading || !isSystemAdmin} placeholder={t('createDevice.config.modelPlaceholder')} className="mt-1">
                  {modelsForType.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isSystemAdmin ? t('createDevice.config.modelHint') : t('editDevice.modelLocked')}
                </p>
              </div>
              <div>
                <Label className="text-[12px]">{t('createDevice.config.openRelay')}</Label>
                <Input type="number" min={1} max={30} value={(config.open_relay_ms ?? 3000) / 1000} onChange={(e) => setConfig(c => ({ ...c, open_relay_ms: Number(e.target.value) * 1000 }))} disabled={loading} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">{t('createDevice.config.openRelayHint')}</p>
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

        {/* Verify Mode */}
        {config.model && capabilities.length > 0 && (
          <Section icon={ShieldCheck} title={t('createDevice.verify.title')} desc={t('createDevice.verify.desc')}>
            <div className="space-y-4">
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

        {config.model && capabilities.length === 0 && (
          <div className="border border-border rounded-lg bg-muted/30 px-5 py-4">
            <div className="flex items-center gap-3">
              <ShieldCheck size={16} className="text-muted-foreground" />
              <p className="text-[12px] text-muted-foreground">{t('createDevice.verify.noMethods')}</p>
            </div>
          </div>
        )}

      </form>
    </div>
  );
}

export function EditDevicePage(props: EditDevicePageProps = {}) {
  return (
    <ErrorBoundary onError={(error, errorInfo) => { console.error('EditDevicePage Error:', error, errorInfo); }}>
      <EditDevicePageContent {...props} />
    </ErrorBoundary>
  );
}
