import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users, Save, Edit3, Shield, Play, Pause, Key, Building2, AlertTriangle } from 'lucide-react';
import { fetchUserAccount, updateUserAccount, deleteUserAccount, resetUserPassword, type UserAccountDTO, type UpdateUserAccountRequest } from '@/lib/api-users';
import { fetchCompanies, type CompanyDTO } from '@/lib/api';
import { Button, Input, Label, ComboBox, type Option } from '@dm3/ui';

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20',
  inactive: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
};

const roleColors: Record<string, string> = {
  system_admin: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20',
  primary_manager: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
  manager: 'bg-[#8B5CF6]/10 text-[#8B5CF6] border-[#8B5CF6]/20',
  operator: 'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20',
  viewer: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
};

export function UserAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [user, setUser] = useState<UserAccountDTO | null>(null);
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    role: '',
    status: '',
    company_id: '',
  });

  const loadUser = () => {
    if (!id) return;
    fetchUserAccount(id)
      .then((u) => {
        setUser(u);
        setForm({
          name: u.name,
          role: u.role,
          status: u.status,
          company_id: u.companies[0]?.company_id || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUser();
    fetchCompanies().then(setCompanies).catch(() => {});
  }, [id]);

  const companyOptions: Option[] = [
    {
      value: '',
      label: 'No Company (System Admin only)',
      icon: <Shield size={14} className="text-[#EF4444]" />
    },
    ...companies.map(company => ({
      value: company.id,
      label: company.name,
      description: `(${company.code})`,
      icon: <Building2 size={14} className="text-[#64748B]" />
    }))
  ];

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updateData: UpdateUserAccountRequest = {
        name: form.name,
        role: form.company_id ? form.role : 'system_admin',
        status: form.status,
        company_id: form.company_id || undefined,
      };
      const updated = await updateUserAccount(id, updateData);
      setUser(updated);
      setEditing(false);
    } catch { /* */ }
    setSaving(false);
  };

  const handleStatusToggle = async () => {
    if (!id || !user) return;
    const isActive = user.status === 'active';
    const action = isActive ? 'deactivate' : 'activate';
    if (!confirm(`Are you sure you want to ${action} ${user.name}?`)) return;
    
    try {
      if (isActive) {
        await deleteUserAccount(id);
      } else {
        await updateUserAccount(id, { status: 'active' });
      }
      loadUser();
    } catch { /* */ }
  };

  const handleResetPassword = async () => {
    if (!id || !user) return;
    if (!confirm(`Are you sure you want to reset password for ${user.name}?`)) return;
    
    try {
      const result = await resetUserPassword(id);
      setResetPasswordResult(result.password);
      setTimeout(() => setResetPasswordResult(null), 10000); // Hide after 10s
    } catch { /* */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <div className="p-6 text-[#64748B] text-[13px]">User not found</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      <Button
        data-testid="user-button-back"
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
            {user.role === 'system_admin' ? (
              <Shield size={20} className="text-[#EF4444]" />
            ) : (
              <Users size={20} className="text-[#F97316]" />
            )}
          </div>
          <div>
            <h1 data-testid="user-text-name" className="text-[20px] font-semibold text-[#F8FAFC]">{user.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span data-testid="user-text-email" className="text-[12px] text-[#64748B]">{user.email}</span>
              <span data-testid="user-badge-status" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${statusColors[user.status] || ''}`}>
                {user.status}
              </span>
              <span data-testid="user-badge-role" className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium border ${roleColors[user.role] || ''}`}>
                {user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="user-button-reset-password"
            variant="outline"
            size="sm"
            onClick={handleResetPassword}
            className="border-[#8B5CF6]/30 text-[#8B5CF6] hover:bg-[#8B5CF6]/10"
          >
            <Key size={14} /> Reset Password
          </Button>
          <Button
            data-testid="user-button-toggle-status"
            variant="outline"
            size="sm"
            onClick={handleStatusToggle}
            disabled={user.role === 'system_admin'}
            className={
              user.status === 'active'
                ? 'border-[#EF4444]/30 text-[#EF4444] hover:bg-[#EF4444]/10'
                : 'border-[#22C55E]/30 text-[#22C55E] hover:bg-[#22C55E]/10'
            }
          >
            {user.status === 'active' ? <Pause size={14} /> : <Play size={14} />}
            {user.status === 'active' ? 'Deactivate' : 'Activate'}
          </Button>
        </div>
      </div>

      {/* Reset Password Result */}
      {resetPasswordResult && (
        <div className="bg-[#0B1120] border border-[#8B5CF6]/30 rounded-md p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Key size={16} className="text-[#8B5CF6]" />
            <span className="text-[11px] uppercase tracking-wider text-[#8B5CF6] font-medium">New Password Generated</span>
          </div>
          <div className="text-[13px] text-[#F8FAFC]">
            <span className="text-[#64748B]">Password:</span> <span className="font-mono bg-[#1E293B] px-2 py-1 rounded">{resetPasswordResult}</span>
          </div>
          <p className="text-[11px] text-[#F59E0B] mt-2">⚠ Save this password — it won't be shown again.</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Info */}
        <div className="border border-[#1E293B] rounded-lg bg-[#111827]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E293B]">
            <h2 className="text-[14px] font-medium text-[#F8FAFC]">User Information</h2>
            {editing ? (
              <div className="flex gap-2">
                <Button data-testid="user-button-cancel" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button data-testid="user-button-save" size="sm" onClick={handleSave} disabled={saving}>
                  <Save size={12} /> {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            ) : (
              <Button data-testid="user-button-edit" variant="ghost" size="sm" onClick={() => setEditing(true)} className="text-[#F97316]">
                <Edit3 size={12} /> Edit
              </Button>
            )}
          </div>

          <div className="p-4 space-y-4">
            {editing ? (
              <>
                <div>
                  <Label>Name</Label>
                  <Input
                    data-testid="user-input-editName"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Company</Label>
                  <ComboBox
                    options={companyOptions}
                    value={form.company_id}
                    placeholder="Select a company"
                    searchPlaceholder="Search companies..."
                    onValueChange={(value) => setForm(f => ({ ...f, company_id: value }))}
                  />
                </div>
                <div>
                  <Label>Role</Label>
                  <select
                    data-testid="user-select-editRole"
                    value={form.role}
                    onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))}
                    disabled={!form.company_id}
                    className="h-9 w-full rounded-md border px-3 py-1 text-sm bg-[#0B1120] border-[#1E293B] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20 disabled:opacity-50"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="operator">Operator</option>
                    <option value="manager">Manager</option>
                    <option value="primary_manager">Primary Manager</option>
                  </select>
                  {!form.company_id && (
                    <p className="text-[11px] text-[#64748B] mt-1">System admin role will be assigned automatically</p>
                  )}
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    data-testid="user-select-editStatus"
                    value={form.status}
                    onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                    className="h-9 w-full rounded-md border px-3 py-1 text-sm bg-[#0B1120] border-[#1E293B] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-[13px]">
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Email:</span>
                  <span data-testid="user-text-displayEmail" className="text-[#F8FAFC]">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Last Login:</span>
                  <span className="text-[#F8FAFC]">
                    {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#64748B]">Created:</span>
                  <span data-testid="user-text-created" className="text-[#F8FAFC]">{new Date(user.created_at).toLocaleDateString()}</span>
                </div>
                {user.role === 'system_admin' && (
                  <div className="flex items-center gap-2 p-2 rounded border border-[#EF4444]/20 bg-[#EF4444]/5">
                    <AlertTriangle size={14} className="text-[#EF4444]" />
                    <span className="text-[11px] text-[#EF4444]">System administrators have full access to all companies and settings.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Company Assignments */}
        <div className="border border-[#1E293B] rounded-lg bg-[#111827]">
          <div className="px-4 py-3 border-b border-[#1E293B]">
            <h2 className="text-[14px] font-medium text-[#F8FAFC]">Company Assignments</h2>
          </div>
          <div className="p-4">
            {!user.companies || user.companies.length === 0 ? (
              <div className="text-center py-4">
                {user.role === 'system_admin' ? (
                  <div className="text-[#64748B] text-[12px]">
                    <Shield size={16} className="mx-auto text-[#EF4444] mb-1" />
                    System admin has access to all companies
                  </div>
                ) : (
                  <p className="text-[#64748B] text-[12px]">No company assignments</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {(user.companies || []).map((company) => (
                  <div
                    data-testid={`user-company-${company.company_id}`}
                    key={company.company_id}
                    className="flex items-center justify-between p-2 rounded border border-[#1E293B]/50"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 size={14} className="text-[#64748B]" />
                      <div>
                        <div className="text-[13px] text-[#F8FAFC] font-medium">{company.company_name}</div>
                        <div className="text-[11px] text-[#94A3B8]">{company.company_code}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[10px] px-2 py-0.5 rounded border ${roleColors[company.role] || roleColors.viewer}`}>
                        {company.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="text-[10px] text-[#64748B] mt-0.5">{company.status}</div>
                    </div>
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