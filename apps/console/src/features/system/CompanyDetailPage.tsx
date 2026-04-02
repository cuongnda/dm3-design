import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Users, Cpu, DoorOpen, Activity, Save } from 'lucide-react';
import { fetchCompany, updateCompany, suspendCompany, type CompanyDTO } from '@/lib/api';
import { Button, Input, Select, SelectOption, Label } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success border-success/20',
  suspended: 'bg-error/10 text-error border-error/20',
  trial: 'bg-warning/10 text-warning border-warning/20',
};

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [company, setCompany] = useState<CompanyDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', phone: '', max_devices: 0, max_users: 0, plan: '' });

  useEffect(() => {
    if (!id) return;
    fetchCompany(id)
      .then((c) => {
        setCompany(c);
        setForm({ name: c.name, address: c.address || '', phone: c.phone || '', max_devices: c.max_devices, max_users: c.max_users, plan: c.plan });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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
    </div>
  );
}
