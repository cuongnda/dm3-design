import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy, Building2, AlertCircle } from 'lucide-react';
import { createAccount, fetchCompanies, fetchAccounts, type CreateAccountResponse, type CompanyDTO, type CreateAccountRequest } from '@/lib/api';
import { Button, Input, Select, SelectOption, Label, ComboBox, type Option } from '@dm3/ui';

export function CreateAccountPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateAccountResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState<CreateAccountRequest>({
    company_id: '',
    admin_email: '',
    plan: 'starter',
    max_devices: 50,
    max_users: 20,
    max_doors: 10,
    billing_email: '',
  });

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  // Load companies without existing accounts
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCompanies(), fetchAccounts(1, 1000)])
      .then(([allCompanies, accountsRes]) => {
        const usedCompanyIds = new Set(accountsRes.data.map(a => a.company_id));
        const availableCompanies = allCompanies.filter(c => !usedCompanyIds.has(c.id));
        setCompanies(availableCompanies);
      })
      .catch((err) => {
        console.error('Failed to load companies:', err);
        setError('Failed to load companies: ' + err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  const companyOptions: Option[] = companies.map(company => ({
    value: company.id,
    label: company.name,
    description: `(${company.code})`,
    icon: <Building2 size={14} className="text-[#64748B]" />
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_id || !form.admin_email) {
      setError('Company and admin email are required');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await createAccount(form);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = () => {
    if (!result) return;
    navigator.clipboard.writeText(`Email: ${result.admin.email}\nPassword: ${result.admin.password}`);
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
          <h2 className="text-[18px] font-semibold text-[#F8FAFC] text-center mb-1">Account Created</h2>
          <p className="text-[13px] text-[#64748B] text-center mb-6">
            <span className="text-[#F8FAFC] font-medium">{result.account.company_name}</span> account has been set up successfully.
          </p>

          <div className="bg-[#0B1120] border border-[#F97316]/30 rounded-md p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-wider text-[#F97316] font-medium">Admin Credentials</span>
              <Button variant="ghost" size="icon-xs" onClick={copyCredentials}>
                {copied ? <Check size={14} className="text-[#22C55E]" /> : <Copy size={14} />}
              </Button>
            </div>
            <div className="space-y-1.5 text-[13px]">
              <div><span className="text-[#64748B]">Email:</span> <span data-testid="create-label-gen-email" className="text-[#F8FAFC] font-mono">{result.admin.email}</span></div>
              <div><span className="text-[#64748B]">Password:</span> <span data-testid="create-label-gen-password" className="text-[#F8FAFC] font-mono">{result.admin.password}</span></div>
            </div>
            <p className="text-[11px] text-[#F59E0B] mt-3">⚠ Save these credentials — the password won't be shown again.</p>
          </div>

          <Button className="w-full" onClick={() => navigate('/system/accounts')}>
            Go to Accounts
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
        onClick={() => navigate('/system/accounts')}
        className="mb-4 text-[#94A3B8] hover:text-[#F8FAFC]"
      >
        <ArrowLeft size={15} /> Back to Accounts
      </Button>
      <h1 className="text-[20px] font-semibold text-[#F8FAFC] mb-6">{t('accounts.createAccount')}</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div data-testid="create-text-error" className="px-3 py-2 bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-md text-[#EF4444] text-[13px] flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div>
          <Label>{t('accounts.form.company')} *</Label>
          {loading ? (
            <div className="h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#64748B] flex items-center">
              Loading companies...
            </div>
          ) : (
            <ComboBox
              options={companyOptions}
              value={form.company_id}
              placeholder="Select a company"
              searchPlaceholder="Search companies..."
              onValueChange={(value) => set('company_id', value)}
              disabled={loading}
            />
          )}
          {companies.length === 0 && !loading && (
            <p className="text-[11px] text-[#64748B] mt-1">All companies already have accounts</p>
          )}
        </div>

        <div>
          <Label>{t('accounts.form.adminEmail')} *</Label>
          <Input
            data-testid="create-input-adminEmail"
            required
            type="email"
            value={form.admin_email}
            onChange={(e) => set('admin_email', e.target.value)}
            placeholder="admin@company.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>{t('accounts.form.plan')}</Label>
            <select
              data-testid="create-select-plan"
              value={form.plan}
              onChange={(e) => set('plan', e.target.value)}
              className="h-9 w-full rounded-md border px-3 py-1 text-sm bg-[#0B1120] border-[#1E293B] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
            >
              <option value="starter">Starter</option>
              <option value="professional">Professional</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <Label>{t('accounts.form.billingEmail')}</Label>
            <Input
              data-testid="create-input-billingEmail"
              type="email"
              value={form.billing_email || ''}
              onChange={(e) => set('billing_email', e.target.value)}
              placeholder="billing@company.com"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>{t('accounts.form.maxUsers')}</Label>
            <Input
              data-testid="create-input-maxUsers"
              type="number"
              min="1"
              value={form.max_users}
              onChange={(e) => set('max_users', parseInt(e.target.value) || 20)}
            />
          </div>
          <div>
            <Label>{t('accounts.form.maxDevices')}</Label>
            <Input
              data-testid="create-input-maxDevices"
              type="number"
              min="1"
              value={form.max_devices}
              onChange={(e) => set('max_devices', parseInt(e.target.value) || 50)}
            />
          </div>
          <div>
            <Label>{t('accounts.form.maxDoors')}</Label>
            <Input
              data-testid="create-input-maxDoors"
              type="number"
              min="1"
              value={form.max_doors}
              onChange={(e) => set('max_doors', parseInt(e.target.value) || 10)}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            data-testid="create-button-cancel"
            type="button"
            variant="ghost"
            onClick={() => navigate('/system/accounts')}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            data-testid="create-button-submit"
            type="submit"
            disabled={submitting || !form.company_id || !form.admin_email}
            className="flex-1"
          >
            {submitting ? 'Creating...' : t('accounts.createAccount')}
          </Button>
        </div>
      </form>
    </div>
  );
}