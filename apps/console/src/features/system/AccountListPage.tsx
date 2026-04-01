import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard, Plus, Search, X, Check, Building2 } from 'lucide-react';
import { fetchAccounts, createAccount, fetchCompanies, type AccountDTO, type CreateAccountRequest, type CompanyDTO, type CreateAccountResponse } from '@/lib/api';
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

export function AccountListPage() {
  const navigate = useNavigate();
  const { t } = useTranslation('system');
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);

  const loadAccounts = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (statusFilter) params.status = statusFilter;
    if (planFilter) params.plan = planFilter;
    
    fetchAccounts(page, 20, params)
      .then((res) => {
        setAccounts(res.data);
        setTotal(res.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAccounts();
  }, [search, statusFilter, planFilter, page]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-[#F8FAFC]">{t('accounts.title')}</h1>
          <p className="text-[13px] text-[#64748B]">{total} {t('accounts.description')}</p>
        </div>
        <Button data-testid="account-button-create" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> {t('accounts.createAccount')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#64748B]" />
          <Input
            data-testid="account-input-search"
            placeholder={t('accounts.searchPlaceholder')}
            value={search}
            onChange={(e) => {setSearch(e.target.value); setPage(1);}}
            className="pl-10"
          />
        </div>
        <Select
          data-testid="account-select-status"
          value={statusFilter}
          onChange={(value) => {setStatusFilter(value); setPage(1);}}
        >
          <SelectOption value="">{t('accounts.filters.allStatuses')}</SelectOption>
          <SelectOption value="active">{t('accounts.filters.active')}</SelectOption>
          <SelectOption value="suspended">{t('accounts.filters.suspended')}</SelectOption>
          <SelectOption value="deactivated">{t('accounts.filters.deactivated')}</SelectOption>
        </Select>
        <Select
          data-testid="account-select-plan"
          value={planFilter}
          onChange={(value) => {setPlanFilter(value); setPage(1);}}
        >
          <SelectOption value="">{t('accounts.filters.allPlans')}</SelectOption>
          <SelectOption value="starter">Starter</SelectOption>
          <SelectOption value="professional">Professional</SelectOption>
          <SelectOption value="enterprise">Enterprise</SelectOption>
        </Select>
      </div>

      {/* Table */}
      <div className="border border-[#1E293B] rounded-lg overflow-hidden bg-[#111827]">
        <table data-testid="account-table-list" className="w-full">
          <thead>
            <tr className="bg-[#0F172A] text-[11px] text-[#64748B] uppercase tracking-wider">
              <th className="text-left py-3 px-4 font-medium">{t('accounts.table.companyName')}</th>
              <th className="text-left py-3 px-4 font-medium">{t('accounts.table.code')}</th>
              <th className="text-left py-3 px-4 font-medium">{t('accounts.table.plan')}</th>
              <th className="text-left py-3 px-4 font-medium">{t('accounts.table.status')}</th>
              <th className="text-left py-3 px-4 font-medium">{t('accounts.table.owner')}</th>
              <th className="text-right py-3 px-4 font-medium">{t('accounts.table.maxUsers')}</th>
              <th className="text-right py-3 px-4 font-medium">{t('accounts.table.maxDevices')}</th>
              <th className="text-left py-3 px-4 font-medium">{t('accounts.table.created')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <div className="w-6 h-6 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : accounts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <CreditCard size={32} className="mx-auto text-[#334155] mb-2" />
                  <p className="text-[13px] text-[#64748B]">
                    {search ? t('accounts.noResults') : t('accounts.empty')}
                  </p>
                </td>
              </tr>
            ) : (
              accounts.map((account) => (
                <tr
                  data-testid={`account-row-${account.id}`}
                  key={account.id}
                  onClick={() => navigate(`/system/accounts/${account.id}`)}
                  className="border-t border-[#1E293B] hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                >
                  <td className="py-3 px-4 text-[13px] text-[#F8FAFC] font-medium">{account.company_name}</td>
                  <td className="py-3 px-4 text-[13px] text-[#94A3B8] font-mono">{account.company_code}</td>
                  <td className="py-3 px-4">
                    <span data-testid={`account-badge-plan-${account.id}`} className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${planColors[account.plan] || planColors.starter}`}>
                      {account.plan}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span data-testid={`account-badge-status-${account.id}`} className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium capitalize border ${statusColors[account.status] || statusColors.active}`}>
                      {account.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-[13px] text-[#94A3B8]">{account.owner_email || '—'}</td>
                  <td className="py-3 px-4 text-[13px] text-[#94A3B8] text-right">{account.user_count}/{account.max_users}</td>
                  <td className="py-3 px-4 text-[13px] text-[#94A3B8] text-right">{account.device_count}/{account.max_devices}</td>
                  <td className="py-3 px-4 text-[13px] text-[#64748B]">
                    {new Date(account.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-[#64748B]">
            Page {page} of {totalPages} ({total} total)
          </span>
          <div className="flex gap-1">
            <Button
              data-testid="account-button-prev"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              data-testid="account-button-next"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateAccountModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}

interface CreateAccountModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateAccountModal({ onClose, onCreated }: CreateAccountModalProps) {
  const { t } = useTranslation('system');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateAccountResponse | null>(null);
  
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
      .catch(() => setError('Failed to load companies'))
      .finally(() => setLoading(false));
  }, []);

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
    }
    setSubmitting(false);
  };

  // Success view
  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="p-6 max-w-lg mx-auto">
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
              </div>
              <div className="space-y-1.5 text-[13px]">
                <div><span className="text-[#64748B]">Email:</span> <span data-testid="account-label-gen-email" className="text-[#F8FAFC] font-mono">{result.admin.email}</span></div>
                <div><span className="text-[#64748B]">Password:</span> <span data-testid="account-label-gen-password" className="text-[#F8FAFC] font-mono">{result.admin.password}</span></div>
              </div>
              <p className="text-[11px] text-[#F59E0B] mt-3">⚠ Save these credentials — the password won't be shown again.</p>
            </div>

            <Button data-testid="account-button-done" className="w-full" onClick={() => { onCreated(); onClose(); }}>
              Go to Accounts
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-[18px] font-semibold text-[#F8FAFC]">{t('accounts.createAccount')}</h2>
          <Button data-testid="account-button-closeModal" variant="ghost" size="icon" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        {error && (
          <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-md p-3 mb-4 flex items-center gap-2">
            <AlertCircle size={16} className="text-[#EF4444]" />
            <span className="text-[13px] text-[#EF4444]">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <Label>{t('accounts.form.company')} *</Label>
            <Select
              data-testid="account-select-company"
              value={form.company_id}
              onChange={(value) => set('company_id', value)}
              disabled={loading}
            >
              <SelectOption value="">
                {loading ? 'Loading companies...' : 'Select a company'}
              </SelectOption>
              {companies.map((company) => (
                <SelectOption key={company.id} value={company.id}>
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-[#64748B]" />
                    <span>{company.name}</span>
                    <span className="text-[#64748B] text-xs font-mono ml-auto">({company.code})</span>
                  </div>
                </SelectOption>
              ))}
            </Select>
            {companies.length === 0 && !loading && (
              <p className="text-[11px] text-[#64748B] mt-1">All companies already have accounts</p>
            )}
          </div>

          <div>
            <Label>{t('accounts.form.adminEmail')} *</Label>
            <Input
              data-testid="account-input-adminEmail"
              type="email"
              value={form.admin_email}
              onChange={(e) => set('admin_email', e.target.value)}
              placeholder="admin@company.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('accounts.form.plan')}</Label>
              <Select
                data-testid="account-select-plan"
                value={form.plan}
                onChange={(value) => set('plan', value)}
              >
                <SelectOption value="starter">Starter</SelectOption>
                <SelectOption value="professional">Professional</SelectOption>
                <SelectOption value="enterprise">Enterprise</SelectOption>
              </Select>
            </div>
            <div>
              <Label>{t('accounts.form.billingEmail')}</Label>
              <Input
                data-testid="account-input-billingEmail"
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
                data-testid="account-input-maxUsers"
                type="number"
                min="1"
                value={form.max_users}
                onChange={(e) => set('max_users', parseInt(e.target.value) || 20)}
              />
            </div>
            <div>
              <Label>{t('accounts.form.maxDevices')}</Label>
              <Input
                data-testid="account-input-maxDevices"
                type="number"
                min="1"
                value={form.max_devices}
                onChange={(e) => set('max_devices', parseInt(e.target.value) || 50)}
              />
            </div>
            <div>
              <Label>{t('accounts.form.maxDoors')}</Label>
              <Input
                data-testid="account-input-maxDoors"
                type="number"
                min="1"
                value={form.max_doors}
                onChange={(e) => set('max_doors', parseInt(e.target.value) || 10)}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              data-testid="account-button-cancel"
              type="button"
              variant="ghost"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              data-testid="account-button-submit"
              type="submit"
              disabled={submitting || !form.company_id || !form.admin_email}
              className="flex-1"
            >
              {submitting ? 'Creating...' : t('accounts.createAccount')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}