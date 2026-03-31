import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Building2, Users, Cpu, DoorOpen, Activity, Save } from 'lucide-react';
import { fetchCompany, updateCompany, suspendCompany, type CompanyDTO } from '@/lib/api';

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20',
  suspended: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  trial: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
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
      // Refresh
      const c = await fetchCompany(id);
      setCompany(c);
    } catch { /* */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
      </div>
    );
  }

  if (!company) {
    return <div className="p-6 text-[#64748B] text-[13px]">Company not found</div>;
  }

  const stats = [
    { label: t('companyDetail.stats.users'), value: company.user_count ?? 0, icon: Users, max: company.max_users },
    { label: t('companyDetail.stats.devices'), value: company.device_count ?? 0, icon: Cpu, max: company.max_devices },
    { label: t('companyDetail.stats.doors'), value: company.door_count ?? 0, icon: DoorOpen },
    { label: t('companyDetail.stats.events'), value: company.event_count ?? 0, icon: Activity },
  ];

  const inputCls = "w-full h-8 px-2.5 bg-[#0B1120] border border-[#1E293B] rounded text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="p-6 max-w-4xl">
      <button data-testid="detail-button-back" onClick={() => navigate('/system/companies')} className="flex items-center gap-1.5 text-[13px] text-[#94A3B8] hover:text-[#F8FAFC] mb-4 transition-colors">
        <ArrowLeft size={15} /> Back
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
            <Building2 size={20} className="text-[#F97316]" />
          </div>
          <div>
            <h1 data-testid="detail-text-name" className="text-[20px] font-semibold text-[#F8FAFC]">{company.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span data-testid="detail-text-code" className="text-[12px] text-[#64748B] font-mono">{company.code}</span>
              <span data-testid="detail-badge-status" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${statusColors[company.status] || ''}`}>
                {company.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            data-testid="detail-button-suspend"
            onClick={handleSuspend}
            className={`px-3 py-1.5 rounded-md text-[12px] font-medium border transition-colors ${
              company.status === 'suspended'
                ? 'border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/10'
                : 'border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10'
            }`}
          >
            {company.status === 'suspended' ? t('companyDetail.actions.activate') : t('companyDetail.actions.suspend')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats.map(({ label, value, icon: Icon, max }) => (
          <div key={label} className="border border-[#1E293B] rounded-lg p-3 bg-[#111827]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#64748B] uppercase tracking-wider">{label}</span>
              <Icon size={14} className="text-[#475569]" />
            </div>
            <div className="text-[22px] font-semibold text-[#F8FAFC]">{value}</div>
            {max !== undefined && (
              <div className="text-[11px] text-[#475569] mt-0.5">of {max} max</div>
            )}
          </div>
        ))}
      </div>

      {/* Company Info */}
      <div className="border border-[#1E293B] rounded-lg bg-[#111827]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B]">
          <h2 className="text-[14px] font-medium text-[#F8FAFC]">Company Information</h2>
          {editing ? (
            <div className="flex gap-2">
              <button data-testid="detail-button-cancel" onClick={() => setEditing(false)} className="px-2.5 py-1 text-[12px] text-[#94A3B8] hover:text-[#F8FAFC]">Cancel</button>
              <button data-testid="detail-button-save" onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2.5 py-1 bg-[#F97316] hover:bg-[#EA580C] text-white rounded text-[12px] font-medium disabled:opacity-60">
                <Save size={12} /> {saving ? 'Saving...' : t('companyDetail.actions.save')}
              </button>
            </div>
          ) : (
            <button data-testid="detail-button-edit" onClick={() => setEditing(true)} className="px-2.5 py-1 text-[12px] text-[#F97316] hover:text-[#EA580C]">{t('companyDetail.actions.edit')}</button>
          )}
        </div>
        <div className="p-4 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">{t('companyDetail.form.name')}</label>
            <input data-testid="detail-input-name" disabled={!editing} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">{t('companyDetail.form.plan')}</label>
            <select data-testid="detail-select-plan" disabled={!editing} value={form.plan} onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))} className={inputCls}>
              {['trial', 'starter', 'professional', 'enterprise'].map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">{t('companyDetail.form.address')}</label>
            <input data-testid="detail-input-address" disabled={!editing} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">{t('companyDetail.form.phone')}</label>
            <input data-testid="detail-input-phone" disabled={!editing} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">{t('companyDetail.form.maxDevices')}</label>
            <input data-testid="detail-input-maxDevices" disabled={!editing} type="number" value={form.max_devices} onChange={(e) => setForm((f) => ({ ...f, max_devices: +e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">{t('companyDetail.form.maxUsers')}</label>
            <input data-testid="detail-input-maxUsers" disabled={!editing} type="number" value={form.max_users} onChange={(e) => setForm((f) => ({ ...f, max_users: +e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">Created</label>
            <div className="text-[13px] text-[#94A3B8] py-1.5">{new Date(company.created_at).toLocaleString()}</div>
          </div>
          <div>
            <label className="block text-[11px] text-[#64748B] mb-1">Email</label>
            <div className="text-[13px] text-[#94A3B8] py-1.5">{company.email || '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
