import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CreditCard, Users, Cpu, DoorOpen, Activity, Save, Edit3, Shield, Play, Pause } from 'lucide-react';
import { fetchAccount, updateAccount, suspendAccount, reactivateAccount, fetchAccountAudit, type AccountDTO, type AuditEntryDTO, type UpdateAccountRequest } from '@/lib/api';
import { Button, Input, Select, SelectOption, Label } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20',
  suspended: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  deactivated: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
};

const planColors: Record<string, string> = {
  starter: 'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20',
  professional: 'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20',
  enterprise: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
};

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntryDTO[]>([]);
  const [form, setForm] = useState({
    plan: '',
    max_devices: 0,
    max_users: 0,
    max_doors: 0,
    billing_email: '',
    notes: '',
  });

  useEffect(() => {
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

    fetchAccountAudit(id, 1, 10)
      .then((res) => setAuditLog(res.data))
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await updateAccount(id, form);
      setAccount(updated);
      setEditing(false);
    } catch { /* */ }
    setSaving(false);
  };

  const handleSuspendToggle = async () => {
    if (!id || !account) return;
    const isSuspended = account.status === 'suspended';
    const action = isSuspended ? 'reactivate' : 'suspend';
    if (!confirm(`Are you sure you want to ${action} ${account.company_name}?`)) return;
    
    try {
      if (isSuspended) {
        await reactivateAccount(id);
      } else {
        await suspendAccount(id);
      }
      const updated = await fetchAccount(id);
      setAccount(updated);
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

  const stats = [
    { 
      key: 'users', 
      label: t('companyDetail.stats.users'), 
      value: account.user_count, 
      icon: Users, 
      max: account.max_users,
      percentage: Math.round((account.user_count / account.max_users) * 100)
    },
    { 
      key: 'devices', 
      label: t('companyDetail.stats.devices'), 
      value: account.device_count, 
      icon: Cpu, 
      max: account.max_devices,
      percentage: Math.round((account.device_count / account.max_devices) * 100)
    },
    { 
      key: 'doors', 
      label: t('companyDetail.stats.doors'), 
      value: account.door_count, 
      icon: DoorOpen, 
      max: account.max_doors,
      percentage: Math.round((account.door_count / account.max_doors) * 100)
    },
    { 
      key: 'plan', 
      label: 'Plan', 
      value: account.plan, 
      icon: Activity, 
      badge: true
    },
  ];

  return (
    <div className="p-6 max-w-5xl">
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
            <h1 data-testid="account-text-name" className="text-[20px] font-semibold text-[#F8FAFC]">{account.company_name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span data-testid="account-text-code" className="text-[12px] text-[#64748B] font-mono">{account.company_code}</span>
              <span data-testid="account-badge-status" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${statusColors[account.status] || ''}`}>
                {account.status}
              </span>
              <span data-testid="account-badge-plan" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${planColors[account.plan] || ''}`}>
                {account.plan}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="account-button-suspend"
            variant="outline"
            size="sm"
            onClick={handleSuspendToggle}
            className={
              account.status === 'suspended'
                ? 'border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/10'
                : 'border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10'
            }
          >
            {account.status === 'suspended' ? <Play size={14} /> : <Pause size={14} />}
            {account.status === 'suspended' ? 'Reactivate' : 'Suspend'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {stats.map(({ key, label, value, icon: Icon, max, percentage, badge }) => (
          <div key={key} data-testid={`account-stat-${key}`} className="border border-[#1E293B] rounded-lg p-3 bg-[#111827]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-[#64748B] uppercase tracking-wider">{label}</span>
              <Icon size={14} className="text-[#475569]" />
            </div>
            {badge ? (
              <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize border ${planColors[account.plan] || ''}`}>
                {value}
              </span>
            ) : (
              <div>
                <div className="text-[22px] font-semibold text-[#F8FAFC]">{value}</div>
                {max !== undefined && (
                  <>
                    <div className="text-[11px] text-[#475569] mt-0.5">of {max} max</div>
                    {percentage !== undefined && (
                      <div className="w-full bg-[#1E293B] rounded-full h-1.5 mt-1">
                        <div 
                          className={`h-1.5 rounded-full transition-all ${
                            percentage > 80 ? 'bg-[#EF4444]' : percentage > 60 ? 'bg-[#F59E0B]' : 'bg-[#22C55E]'
                          }`}
                          style={{ width: `${Math.min(percentage, 100)}%` }}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Account Info */}
        <div className="border border-[#1E293B] rounded-lg bg-[#111827]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B]">
            <h2 className="text-[14px] font-medium text-[#F8FAFC]">Account Information</h2>
            {editing ? (
              <div className="flex gap-2">
                <Button data-testid="account-button-cancel" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button data-testid="account-button-save" size="sm" onClick={handleSave} disabled={saving}>
                  <Save size={12} /> {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <Button data-testid="account-button-edit" variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-[#F97316]">
                <Edit3 size={12} /> Edit
              </Button>
            )}
          </div>

          <div className="p-4 space-y-4">
            {editing ? (
              <>
                <div>
                  <Label>Plan</Label>
                  <Select
                    data-testid="account-select-editPlan"
                    value={form.plan}
                    onChange={(value) => setForm(f => ({ ...f, plan: value }))}
                  >
                    <SelectOption value="starter">Starter</SelectOption>
                    <SelectOption value="professional">Professional</SelectOption>
                    <SelectOption value="enterprise">Enterprise</SelectOption>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Max Users</Label>
                    <Input
                      data-testid="account-input-editMaxUsers"
                      type="number"
                      min="1"
                      value={form.max_users}
                      onChange={(e) => setForm(f => ({ ...f, max_users: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label>Max Devices</Label>
                    <Input
                      data-testid="account-input-editMaxDevices"
                      type="number"
                      min="1"
                      value={form.max_devices}
                      onChange={(e) => setForm(f => ({ ...f, max_devices: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <Label>Max Doors</Label>
                    <Input
                      data-testid="account-input-editMaxDoors"
                      type="number"
                      min="1"
                      value={form.max_doors}
                      onChange={(e) => setForm(f => ({ ...f, max_doors: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Billing Email</Label>
                  <Input
                    data-testid="account-input-editBillingEmail"
                    type="email"
                    value={form.billing_email}
                    onChange={(e) => setForm(f => ({ ...f, billing_email: e.target.value }))}
                    placeholder="billing@company.com"
                  />
                </div>
                <div>
                  <Label>Notes</Label>
                  <textarea
                    data-testid="account-input-editNotes"
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full h-20 px-3 py-2 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] placeholder-[#64748B] focus:border-[#F97316] focus:outline-none resize-none"
                    placeholder="Additional notes..."
                  />
                </div>
              </>
            ) : (
              <div className="space-y-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Owner:</span>
                  <span data-testid="account-text-owner" className="text-[#F8FAFC]">{account.owner_email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Billing Email:</span>
                  <span data-testid="account-text-billingEmail" className="text-[#F8FAFC]">{account.billing_email || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Subscription:</span>
                  <span className="text-[#F8FAFC]">
                    {account.subscription_start ? new Date(account.subscription_start).toLocaleDateString() : '—'} to{' '}
                    {account.subscription_end ? new Date(account.subscription_end).toLocaleDateString() : 'Unlimited'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Created:</span>
                  <span data-testid="account-text-created" className="text-[#F8FAFC]">{new Date(account.created_at).toLocaleDateString()}</span>
                </div>
                {account.notes && (
                  <div>
                    <span className="text-[#64748B]">Notes:</span>
                    <p data-testid="account-text-notes" className="text-[#F8FAFC] mt-1 text-[12px] bg-[#0F172A] p-2 rounded border border-[#1E293B]">
                      {account.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Audit Log */}
        <div className="border border-[#1E293B] rounded-lg bg-[#111827]">
          <div className="px-4 py-3 border-b border-[#1E293B]">
            <h2 className="text-[14px] font-medium text-[#F8FAFC]">Recent Activity</h2>
          </div>
          <div className="p-4 max-h-[400px] overflow-y-auto">
            {auditLog.length === 0 ? (
              <p className="text-[#64748B] text-[12px] text-center py-4">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {auditLog.map((entry) => (
                  <div
                    data-testid={`account-audit-${entry.id}`}
                    key={entry.id}
                    className="flex items-start justify-between p-2 rounded border border-[#1E293B]/50 hover:border-[#1E293B] transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] text-[#F8FAFC] font-medium capitalize">{entry.action.replace(/_/g, ' ')}</span>
                        <span className="text-[10px] text-[#64748B]">
                          by {entry.actor_email || 'System'}
                        </span>
                      </div>
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div className="text-[10px] text-[#94A3B8] font-mono">
                          {JSON.stringify(entry.changes)}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-[#64748B] ml-2">
                      {new Date(entry.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}