import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy, Building2, AlertCircle, Shield, Users } from 'lucide-react';
import { createUserAccount, type CreateUserAccountResponse, type CreateUserAccountRequest } from '@/lib/api-users';
import { fetchCompanies, type CompanyDTO } from '@/lib/api';
import { Button, Input, Label, ComboBox, type Option } from '@dm3/ui';

export function CreateUserAccountPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateUserAccountResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<CreateUserAccountRequest>({
    email: '',
    name: '',
    role: 'viewer',
    company_id: '',
    send_email: false,
  });

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  // Load companies
  useEffect(() => {
    setLoading(true);
    fetchCompanies()
      .then((companies) => {
        setCompanies(companies);
      })
      .catch((err) => {
        console.error('Failed to load companies:', err);
        setError('Failed to load companies: ' + err.message);
      })
      .finally(() => setLoading(false));
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.name) {
      setError('Email and name are required');
      return;
    }

    // If no company selected, user becomes system_admin
    const finalForm = { ...form };
    if (!finalForm.company_id) {
      finalForm.role = 'system_admin';
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await createUserAccount(finalForm);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to create user account');
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.user.email}\nPassword: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Success view
  if (result) {
    return (
      <div className="p-6 max-w-lg mx-auto mt-12">
        <div className="border border-[#1E293B] rounded-lg p-6 bg-[#111827]">
          <div className="w-12 h-12 rounded-full bg-[#22C55E]/10 flex items-center justify-center mx-auto mb-4">
            <Check size={24} className="text-[#22C55E]" />
          </div>
          <h2 className="text-[18px] font-semibold text-[#F8FAFC] text-center mb-1">User Account Created</h2>
          <p className="text-[13px] text-[#64748B] text-center mb-6">
            <span className="text-[#F8FAFC] font-medium">{result.user.name}</span> ({result.user.email}) has been created successfully.
          </p>

          <div className="bg-[#0B1120] border border-[#F97316]/30 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-[#F97316] font-medium">Login Credentials</span>
              <Button variant="ghost" size="icon-xs" onClick={copyCredentials}>
                {copied ? <Check size={14} className="text-[#22C55E]" /> : <Copy size={14} />}
              </Button>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div><span className="text-[#64748B]">Email:</span> <span data-testid="create-label-gen-email" className="text-[#F8FAFC] font-mono">{result.user.email}</span></div>
              <div><span className="text-[#64748B]">Password:</span> <span data-testid="create-label-gen-password" className="text-[#F8FAFC] font-mono">{result.password}</span></div>
              <div><span className="text-[#64748B]">Role:</span> <span className="text-[#F8FAFC]">{result.user.role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span></div>
            </div>
            <p className="text-[11px] text-[#F59E0B] mt-3">⚠ Save these credentials — the password won't be shown again.</p>
          </div>

          <Button className="w-full" onClick={() => navigate('/system/users')}>
            Go to User Accounts
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <Button
        data-testid="create-button-back"
        variant="ghost"
        size="sm"
        onClick={() => navigate('/system/users')}
        className="mb-4 text-[#94A3B8] hover:text-[#F8FAFC]"
      >
        <ArrowLeft size={15} /> Back to User Accounts
      </Button>
      <h1 className="text-[20px] font-semibold text-[#F8FAFC] mb-6">Create User Account</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div data-testid="create-text-error" className="px-3 py-2 bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-md text-[#EF4444] text-[13px] flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Name *</Label>
            <Input
              data-testid="create-input-name"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="John Doe"
            />
          </div>
          <div>
            <Label>Email *</Label>
            <Input
              data-testid="create-input-email"
              required
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="john@company.com"
            />
          </div>
        </div>

        <div>
          <Label>Company</Label>
          {loading ? (
            <div className="h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#64748B] flex items-center">
              Loading companies...
            </div>
          ) : (
            <ComboBox
              options={companyOptions}
              value={form.company_id || ''}
              placeholder="Select a company or leave empty for system admin"
              searchPlaceholder="Search companies..."
              onValueChange={(value) => set('company_id', value)}
              disabled={loading}
            />
          )}
          <p className="text-[11px] text-[#64748B] mt-1">Leave empty to create a system admin account</p>
        </div>

        <div>
          <Label>Role</Label>
          <select
            data-testid="create-select-role"
            value={form.role}
            onChange={(e) => set('role', e.target.value)}
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

        <div className="flex gap-3 pt-4">
          <Button
            data-testid="create-button-cancel"
            type="button"
            variant="ghost"
            onClick={() => navigate('/system/users')}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            data-testid="create-button-submit"
            type="submit"
            disabled={submitting || !form.email || !form.name}
            className="flex-1"
          >
            {submitting ? 'Creating...' : 'Create User Account'}
          </Button>
        </div>
      </form>
    </div>
  );
}