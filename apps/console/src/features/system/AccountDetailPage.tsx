import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard, Users, Cpu, DoorOpen, Save, X, Shield, Play } from 'lucide-react';
import { Button, Input, Label } from '@dm3/ui';
import {
  fetchAccount,
  updateAccount,
  suspendAccount,
  reactivateAccount,
  fetchAccountAudit,
  type AccountDTO,
  type AuditEntryDTO,
  type UpdateAccountRequest,
} from '@/lib/api';

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20',
  suspended: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  deactivated: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
};

const planColors: Record<string, string> = {
  starter: 'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20',
  professional: 'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20',
  enterprise: 'bg-[#F97316]/10 text-[#F97316] border-[#F97316]/20',
};

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntryDTO[]>([]);
  const [form, setForm] = useState<UpdateAccountRequest>({});

  const loadAccount = () => {
    if (!id) return;
    fetchAccount(id)
      .then((a) => {
        setAccount(a);
        setForm({
          plan: a.plan,
          max_devices: a.max_devices,
          max_users: a.max_users,
          max_doors: a.max_doors,
          billing_email: a.billing_email || '',
          notes: a.notes || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadAudit = () => {
    if (!id) return;
    fetchAccountAudit(id, 1, 20)
      .then((res) => setAuditLog(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    loadAccount();
    loadAudit();
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateAccount(id, form);
      setAccount(updated);
      setEditing(false);
      loadAudit();
    } catch { /* */ }
    setSaving(false);
  };

  const handleSuspendToggle = async () => {
    if (!id || !account) return;
    const action = account.status === 'suspended' ? 'reactivate' : 'suspend';
    if (!confirm(`Are you sure you want to ${action} "${account.company_name}"?`)) return;
    try {
      if (action === 'suspend') {
        await suspendAccount(id);
      } else {
        await reactivateAccount(id);
      }
      loadAccount();
      loadAudit();
    } catch { /* */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
      </div>
    );
  }

  if (!account) {
    return <div className="p-6 text-[#64748B] text-[13px]">Account not found</div>;
  }

  const usageStats = [
    { key: 'users', label: t('accounts.detail.users'), value: account.user_count, max: account.max_users, icon: Users },
    { key: 'devices', label: t('accounts.detail.devices'), value: account.device_count, max: account.max_devices, icon: Cpu },
    { key: 'doors', label: t('accounts.detail.doors'), value: account.door_count, max: account.max_doors, icon: DoorOpen },
  ];

  return (
    <div className="p-6 max-w-4xl">
      <Button
        data-testid="account-button-back"
        variant="ghost"
        size="sm"
        onClick={() => navigate('/system/accounts')}
        className="mb-4 text-[#94A3B8] hover:text-[#F8FAFC]"
      >
        <ArrowLeft size={15} /> Back
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
            <CreditCard size={20} className="text-[#F97316]" />
          </div>
          <div>
            <h1 data-testid="account-text-companyName" className="text-[20px] font-semibold text-[#F8FAFC]">{account.company_name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span data-testid="account-text-code" className="text-[12px] text-[#64748B] font-mono">{account.company_code}</span>
              <span data-testid="account-badge-plan" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${planColors[account.plan] || ''}`}>
                {account.plan}
              </span>
              <span data-testid="account-badge-status" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${statusColors[account.status] || ''}`}>
                {account.status}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="account-button-edit"
            variant="ghost"
            size="sm"
            onClick={() => setEditing(!editing)}
            className="text-[#F97316]"
          >
            {editing ? 'Cancel' : t('accounts.detail.edit')}
          </Button>
          <Button
            data-testid="account-button-suspendToggle"
            variant="outline"
            size="sm"
            onClick={handleSuspendToggle}
            className={
              account.status === 'suspended'
                ? 'border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/10'
                : 'border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10'
            }
          >
            {account.status === 'suspended' ? (
              <><Play size={12} /> {t('accounts.detail.reactivate')}</>
            ) : (
              <><Shield size={12} /> {t('accounts.detail.suspend')}</>
            )}
          </Button>
        </div>
      </div>

      {/* Usage Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {usageStats.map(({ key, label, value, max, icon: Icon }) => {
          const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
          const barColor = pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#22C55E';
          return (
            <div key={key} data-testid={`account-stat-${key}`} className="border border-[#1E293B] rounded-lg p-3 bg-[#111827]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#64748B] uppercase tracking-wider">{label}</span>
                <Icon size={14} className="text-[#475569]" />
              </div>
              <div className="text-[22px] font-semibold text-[#F8FAFC]">{value} <span className="text-[13px] text-[#64748B] font-normal">/ {max}</span></div>
              <div className="mt-2 h-1.5 bg-[#1E293B] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Owner Info */}
      <div className="border border-[#1E293B] rounded-lg bg-[#111827] p-4 mb-6">
        <h2 className="text-[14px] font-medium text-[#F8FAFC] mb-2">{t('accounts.detail.ownerInfo')}</h2>
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <span className="text-[#64748B]">{t('accounts.detail.ownerEmail')}:</span>{' '}
            <span data-testid="account-text-ownerEmail" className="text-[#F8FAFC]">{account.owner_email || '—'}</span>
          </div>
          <div>
            <span className="text-[#64748B]">{t('accounts.detail.ownerName')}:</span>{' '}
            <span data-testid="account-text-ownerName" className="text-[#F8FAFC]">{account.owner_name || '—'}</span>
          </div>
          <div>
            <span className="text-[#64748B]">{t('accounts.detail.billingEmail')}:</span>{' '}
            <span className="text-[#F8FAFC]">{account.billing_email || '—'}</span>
          </div>
          <div>
            <span className="text-[#64748B]">Created:</span>{' '}
            <span className="text-[#F8FAFC]">{new Date(account.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="border border-[#1E293B] rounded-lg bg-[#111827] mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B]">
            <h2 className="text-[14px] font-medium text-[#F8FAFC]">{t('accounts.detail.editAccount')}</h2>
            <Button data-testid="account-button-save" size="sm" onClick={handleSave} disabled={saving}>
              <Save size={12} /> {saving ? 'Saving...' : t('accounts.detail.save')}
            </Button>
          </div>
          <div className="p-4 grid grid-cols-2 gap-4">
            <div>
              <Label>{t('accounts.form.plan')}</Label>
              <select
                data-testid="account-select-editPlan"
                value={form.plan}
                onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                className="w-full h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
              >
                <option value="starter">Starter</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <Label>{t('accounts.form.billingEmail')}</Label>
              <Input data-testid="account-input-editBillingEmail" value={form.billing_email || ''} onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value }))} />
            </div>
            <div>
              <Label>{t('accounts.form.maxDevices')}</Label>
              <Input data-testid="account-input-editMaxDevices" type="number" value={form.max_devices} onChange={(e) => setForm((f) => ({ ...f, max_devices: +e.target.value }))} />
            </div>
            <div>
              <Label>{t('accounts.form.maxUsers')}</Label>
              <Input data-testid="account-input-editMaxUsers" type="number" value={form.max_users} onChange={(e) => setForm((f) => ({ ...f, max_users: +e.target.value }))} />
            </div>
            <div>
              <Label>{t('accounts.form.maxDoors')}</Label>
              <Input data-testid="account-input-editMaxDoors" type="number" value={form.max_doors} onChange={(e) => setForm((f) => ({ ...f, max_doors: +e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>{t('accounts.form.notes')}</Label>
              <textarea
                data-testid="account-input-editNotes"
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none resize-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Audit Log */}
      <div className="border border-[#1E293B] rounded-lg bg-[#111827]">
        <div className="px-4 py-3 border-b border-[#1E293B]">
          <h2 className="text-[14px] font-medium text-[#F8FAFC]">{t('accounts.detail.auditLog')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table data-testid="account-table-audit" className="w-full">
            <thead>
              <tr className="text-[11px] text-[#64748B] uppercase tracking-wider">
                <th className="text-left py-2 px-4 font-medium">{t('accounts.audit.action')}</th>
                <th className="text-left py-2 px-4 font-medium">{t('accounts.audit.actor')}</th>
                <th className="text-left py-2 px-4 font-medium">{t('accounts.audit.changes')}</th>
                <th className="text-left py-2 px-4 font-medium">{t('accounts.audit.time')}</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[13px] text-[#64748B]">
                    {t('accounts.audit.empty')}
                  </td>
                </tr>
              ) : (
                auditLog.map((entry) => (
                  <tr key={entry.id} data-testid={`account-audit-${entry.id}`} className="border-t border-[#1E293B]">
                    <td className="py-2 px-4">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize bg-[#3B82F6]/10 text-[#3B82F6]">
                        {entry.action}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-[12px] text-[#94A3B8]">{entry.actor_email || '—'}</td>
                    <td className="py-2 px-4 text-[12px] text-[#64748B] font-mono max-w-[300px] truncate">
                      {JSON.stringify(entry.changes)}
                    </td>
                    <td className="py-2 px-4 text-[12px] text-[#64748B]">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
