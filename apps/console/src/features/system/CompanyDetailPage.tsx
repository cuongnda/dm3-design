import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Users, Cpu, DoorOpen, Activity, Save, Puzzle } from 'lucide-react';
import { fetchCompany, updateCompany, suspendCompany, fetchTenantPlugins, updateTenantPlugins, type CompanyDTO, type PluginInfo } from '@/lib/api';
import { Button, Input, Select, SelectOption, Label, useBreadcrumbStore } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  suspended: 'bg-error/10 text-error border-error/20',
  trial: 'bg-warning/10 text-warning border-warning/20',
};

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const setLabel = useBreadcrumbStore((s) => s.setLabel);
  const clearLabel = useBreadcrumbStore((s) => s.clearLabel);
  const [company, setCompany] = useState<CompanyDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '', max_devices: 0, max_users: 0, plan: '' });

  const [availablePlugins, setAvailablePlugins] = useState<PluginInfo[]>([]);
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);
  const [savingPlugins, setSavingPlugins] = useState(false);
  const [pluginSaveMsg, setPluginSaveMsg] = useState<'saved' | 'error' | null>(null);

  const loadPlugins = useCallback(async (tenantId: string) => {
    try {
      const res = await fetchTenantPlugins(tenantId);
      setAvailablePlugins(res.available_plugins);
      setEnabledPlugins(res.enabled_plugins);
    } catch { /* */ }
  }, []);

  useEffect(() => {
    if (!id) return;
    fetchCompany(id)
      .then((c) => {
        setCompany(c);
        setForm({ name: c.name, address: c.address || '', phone: c.phone || '', max_devices: c.max_devices, max_users: c.max_users, plan: c.plan });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    loadPlugins(id);
  }, [id, loadPlugins]);

  useEffect(() => {
    if (id && company?.name) setLabel(id, company.name);
    return () => { if (id) clearLabel(id); };
  }, [id, company?.name, setLabel, clearLabel]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateCompany(id, form);
      setCompany(updated);
      setEditing(false);
    } catch { /* */ }
    setSaving(false);
  };

  const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
    if (!id) return;
    setSavingPlugins(true);
    setPluginSaveMsg(null);
    const next = enabled
      ? [...enabledPlugins, pluginId]
      : enabledPlugins.filter((p) => p !== pluginId);
    try {
      const res = await updateTenantPlugins(id, next);
      setEnabledPlugins(res.enabled_plugins);
      setPluginSaveMsg('saved');
    } catch {
      setPluginSaveMsg('error');
    }
    setSavingPlugins(false);
    setTimeout(() => setPluginSaveMsg(null), 2000);
  };

  const handleSuspend = async () => {
    if (!id || !company) return;
    if (!confirm(`Are you sure you want to ${company.status === 'suspended' ? 'activate' : 'suspend'} ${company.name}?`)) return;
    try {
      await suspendCompany(id);
      const c = await fetchCompany(id);
      setCompany(c);
    } catch { /* */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-operate/30 border-t-operate rounded-full animate-spin" />
      </div>
    );
  }

  if (!company) {
    return <div className="p-6 text-muted-foreground text-[13px]">Company not found</div>;
  }

  const stats = [
    { key: 'users', label: t('companyDetail.stats.users'), value: company.user_count ?? 0, icon: Users, max: company.max_users },
    { key: 'devices', label: t('companyDetail.stats.devices'), value: company.device_count ?? 0, icon: Cpu, max: company.max_devices },
    { key: 'doors', label: t('companyDetail.stats.doors'), value: company.door_count ?? 0, icon: DoorOpen },
    { key: 'events', label: t('companyDetail.stats.events'), value: company.event_count ?? 0, icon: Activity },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <Button
        data-testid="detail-button-back"
        variant="ghost"
        size="sm"
        onClick={() => navigate('/system/companies')}
        className="mb-4 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={15} /> Back
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-operate/10 flex items-center justify-center">
            <Building2 size={20} className="text-operate" />
          </div>
          <div>
            <h1 data-testid="detail-text-name" className="text-[20px] font-semibold text-foreground">{company.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span data-testid="detail-text-code" className="text-[12px] text-muted-foreground font-mono">{company.code}</span>
              <span data-testid="detail-badge-status" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${statusColors[company.status] || ''}`}>
                {company.status}
              </span>
            </div>
          </div>
        </div>
        <Button
          data-testid="detail-button-suspend"
          variant="outline"
          size="sm"
          onClick={handleSuspend}
          className={
            company.status === 'suspended'
              ? 'border-success/30 text-success hover:bg-success/10'
              : 'border-error/30 text-error hover:bg-error/10'
          }
        >
          {company.status === 'suspended' ? t('companyDetail.actions.activate') : t('companyDetail.actions.suspend')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats.map(({ key, label, value, icon: Icon, max }) => (
          <div key={key} data-testid={`detail-stat-${key}`} className="border border-border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
              <Icon size={14} className="text-muted-foreground" />
            </div>
            <div className="text-[22px] font-semibold text-foreground">{value}</div>
            {max !== undefined && (
              <div className="text-[11px] text-muted-foreground mt-0.5">of {max} max</div>
            )}
          </div>
        ))}
      </div>

      {/* Company Info */}
      <div className="border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-[14px] font-medium text-foreground">Company Information</h2>
          {editing ? (
            <div className="flex gap-2">
              <Button data-testid="detail-button-cancel" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button data-testid="detail-button-save" size="sm" onClick={handleSave} disabled={saving}>
                <Save size={12} /> {saving ? 'Saving...' : t('companyDetail.actions.save')}
              </Button>
            </div>
          ) : (
            <Button data-testid="detail-button-edit" variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-operate">
              {t('companyDetail.actions.edit')}
            </Button>
          )}
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div>
            <Label>{t('companyDetail.form.name')}</Label>
            <Input data-testid="detail-input-name" disabled={!editing} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>{t('companyDetail.form.plan')}</Label>
            <Select data-testid="detail-select-plan" disabled={!editing} value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}>
              {['trial', 'starter', 'professional', 'enterprise'].map((p) => (
                <SelectOption key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectOption>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('companyDetail.form.address')}</Label>
            <Input data-testid="detail-input-address" disabled={!editing} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </div>
          <div>
            <Label>{t('companyDetail.form.phone')}</Label>
            <Input data-testid="detail-input-phone" disabled={!editing} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>{t('companyDetail.form.maxDevices')}</Label>
            <Input data-testid="detail-input-maxDevices" disabled={!editing} type="number" value={form.max_devices} onChange={(e) => setForm((f) => ({ ...f, max_devices: +e.target.value }))} />
          </div>
          <div>
            <Label>{t('companyDetail.form.maxUsers')}</Label>
            <Input data-testid="detail-input-maxUsers" disabled={!editing} type="number" value={form.max_users} onChange={(e) => setForm((f) => ({ ...f, max_users: +e.target.value }))} />
          </div>
          <div>
            <Label>Created</Label>
            <div className="text-[13px] text-muted-foreground py-1.5">{new Date(company.created_at).toLocaleString()}</div>
          </div>
          <div>
            <Label>Email</Label>
            <div className="text-[13px] text-muted-foreground py-1.5">{company.email || '—'}</div>
          </div>
        </div>
      </div>

      {/* Plugins */}
      {availablePlugins.length > 0 && (
        <div className="border border-border rounded-lg bg-card mt-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <Puzzle size={16} className="text-operate" />
              <h2 className="text-[14px] font-medium text-foreground">{t('plugins.title')}</h2>
            </div>
            {pluginSaveMsg === 'saved' && (
              <span className="text-[11px] text-success">{t('plugins.saved')}</span>
            )}
            {pluginSaveMsg === 'error' && (
              <span className="text-[11px] text-error">{t('plugins.saveError')}</span>
            )}
          </div>
          <div className="p-4">
            <p className="text-[12px] text-muted-foreground mb-4">{t('plugins.description')}</p>
            <div className="space-y-3">
              {availablePlugins.map((plugin) => {
                const isEnabled = enabledPlugins.includes(plugin.id);
                return (
                  <div
                    key={plugin.id}
                    data-testid={`plugin-toggle-${plugin.id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg border border-border"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{plugin.name}</span>
                        {plugin.is_core && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-operate/10 text-operate border border-operate/20 font-medium">
                            {t('plugins.core')}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{plugin.description}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isEnabled}
                      disabled={plugin.is_core || savingPlugins}
                      onClick={() => handleTogglePlugin(plugin.id, !isEnabled)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors
                        ${isEnabled ? 'bg-operate' : 'bg-muted'}
                        ${plugin.is_core || savingPlugins ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform
                          ${isEnabled ? 'translate-x-4' : 'translate-x-0.5'}
                        `}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
