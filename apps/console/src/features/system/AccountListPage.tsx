import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard, Plus, Search, X } from 'lucide-react';
import { Button, Input, Label, Select, SelectOption } from '@dm3/ui';
import {
  fetchAccounts,
  createAccount,
  type AccountDTO,
  type CreateAccountRequest,
  type CreateAccountResponse,
} from '@/lib/api';

const planColors: Record<string, string> = {
  starter: 'bg-[#3B82F6]/10 text-[#3B82F6]',
  professional: 'bg-[#8B5CF6]/10 text-[#8B5CF6]',
  enterprise: 'bg-[#F97316]/10 text-[#F97316]',
};

const statusColors: Record<string, string> = {
  active: 'bg-[#22C55E]/10 text-[#22C55E]',
  suspended: 'bg-[#EF4444]/10 text-[#EF4444]',
  deactivated: 'bg-[#64748B]/10 text-[#64748B]',
};

export function AccountListPage() {
  const { t } = useTranslation('system');
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<AccountDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [createResult, setCreateResult] = useState<CreateAccountResponse | null>(null);

  const loadAccounts = useCallback(() => {
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
  }, [page, search, statusFilter, planFilter]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-[#F8FAFC]">{t('accounts.title')}</h1>
          <p className="text-[13px] text-[#64748B] mt-0.5">
            {total} {t('accounts.description')}
          </p>
        </div>
        <Button
          data-testid="account-button-create"
          onClick={() => { setShowCreate(true); setCreateResult(null); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-[13px] font-medium"
        >
          <Plus size={15} />
          {t('accounts.createAccount')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B]" />
          <input
            data-testid="account-input-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('accounts.searchPlaceholder')}
            className="w-full h-9 pl-9 pr-3 bg-[#111827] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] placeholder:text-[#64748B] focus:border-[#F97316] focus:outline-none focus:ring-1 focus:ring-[#F97316]/20"
          />
        </div>
        <select
          data-testid="account-select-status"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 bg-[#111827] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
        >
          <option value="">{t('accounts.filters.allStatuses')}</option>
          <option value="active">{t('accounts.filters.active')}</option>
          <option value="suspended">{t('accounts.filters.suspended')}</option>
          <option value="deactivated">{t('accounts.filters.deactivated')}</option>
        </select>
        <select
          data-testid="account-select-plan"
          value={planFilter}
          onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="h-9 px-3 bg-[#111827] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
        >
          <option value="">{t('accounts.filters.allPlans')}</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Table */}
      <div className="border border-[#1E293B] rounded-lg overflow-hidden">
        <table data-testid="account-table-list" className="w-full">
          <thead>
            <tr className="bg-[#111827] text-[11px] text-[#64748B] uppercase tracking-wider">
              <th className="text-left py-2.5 px-4 font-medium">{t('accounts.table.companyName')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('accounts.table.code')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('accounts.table.plan')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('accounts.table.status')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('accounts.table.owner')}</th>
              <th className="text-right py-2.5 px-4 font-medium">{t('accounts.table.maxUsers')}</th>
              <th className="text-right py-2.5 px-4 font-medium">{t('accounts.table.maxDevices')}</th>
              <th className="text-left py-2.5 px-4 font-medium">{t('accounts.table.created')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[13px] text-[#64748B]">
                  <div className="w-5 h-5 border-2 border-[#F97316]/30 border-t-[#F97316] rounded-full animate-spin mx-auto" />
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
              accounts.map((a) => (
                <tr
                  data-testid={`account-row-${a.id}`}
                  key={a.id}
                  onClick={() => navigate(`/system/accounts/${a.id}`)}
                  className="border-t border-[#1E293B] hover:bg-[#1E293B]/50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 text-[13px] text-[#F8FAFC] font-medium">{a.company_name}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] font-mono">{a.company_code}</td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${planColors[a.plan] || planColors.starter}`}>
                      {a.plan}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[a.status] || statusColors.active}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8]">{a.owner_email || '—'}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] text-right">{a.user_count}/{a.max_users}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#94A3B8] text-right">{a.device_count}/{a.max_devices}</td>
                  <td className="py-2.5 px-4 text-[13px] text-[#64748B]">
                    {new Date(a.created_at).toLocaleDateString()}
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
            <button
              data-testid="account-button-prev"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1.5 text-[12px] rounded-md border border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B] disabled:opacity-40"
            >
              Previous
            </button>
            <button
              data-testid="account-button-next"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 text-[12px] rounded-md border border-[#1E293B] text-[#94A3B8] hover:bg-[#1E293B] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create Account Modal */}
      {showCreate && (
        <CreateAccountModal
          onClose={() => { setShowCreate(false); setCreateResult(null); }}
          onCreated={(result) => { setCreateResult(result); loadAccounts(); }}
          result={createResult}
        />
      )}
    </div>
  );
}

// ─── Create Account Modal ────────────────────────────────────────────────────

function CreateAccountModal({
  onClose,
  onCreated,
  result,
}: {
  onClose: () => void;
  onCreated: (r: CreateAccountResponse) => void;
  result: CreateAccountResponse | null;
}) {
  const { t } = useTranslation('system');
  const [form, setForm] = useState<CreateAccountRequest>({
    company_name: '',
    company_code: '',
    admin_email: '',
    plan: 'starter',
    max_devices: 50,
    max_users: 20,
    max_doors: 10,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.company_name || !form.company_code || !form.admin_email) {
      setError('All required fields must be filled');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await createAccount(form);
      onCreated(res);
    } catch (e: any) {
      setError(e.message || 'Failed to create account');
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-semibold text-[#F8FAFC]">{t('accounts.createAccount')}</h2>
          <button data-testid="account-button-closeModal" onClick={onClose} className="text-[#64748B] hover:text-[#F8FAFC]">
            <X size={18} />
          </button>
        </div>

        {result ? (
          <div>
            <div className="bg-[#22C55E]/10 border border-[#22C55E]/20 rounded-md p-4 mb-4">
              <p className="text-[13px] text-[#22C55E] font-medium mb-2">{t('accounts.createSuccess')}</p>
              <div className="space-y-1 text-[12px] text-[#94A3B8]">
                <p>Company: <span className="text-[#F8FAFC]">{result.account.company_name}</span></p>
                <p>Admin Email: <span className="text-[#F8FAFC] font-mono">{result.admin.email}</span></p>
                <p>Password: <span className="text-[#F97316] font-mono">{result.admin.password}</span></p>
              </div>
            </div>
            <Button data-testid="account-button-done" onClick={onClose} className="w-full">Done</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {error && (
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-md p-2 text-[12px] text-[#EF4444]">{error}</div>
            )}
            <div>
              <Label>{t('accounts.form.companyName')} *</Label>
              <Input data-testid="account-input-companyName" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div>
              <Label>{t('accounts.form.companyCode')} *</Label>
              <Input data-testid="account-input-companyCode" value={form.company_code} onChange={(e) => setForm((f) => ({ ...f, company_code: e.target.value }))} />
            </div>
            <div>
              <Label>{t('accounts.form.adminEmail')} *</Label>
              <Input data-testid="account-input-adminEmail" type="email" value={form.admin_email} onChange={(e) => setForm((f) => ({ ...f, admin_email: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('accounts.form.plan')}</Label>
                <select
                  data-testid="account-select-createPlan"
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
                <Input data-testid="account-input-billingEmail" type="email" value={form.billing_email || ''} onChange={(e) => setForm((f) => ({ ...f, billing_email: e.target.value || undefined }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{t('accounts.form.maxDevices')}</Label>
                <Input data-testid="account-input-maxDevices" type="number" value={form.max_devices} onChange={(e) => setForm((f) => ({ ...f, max_devices: +e.target.value }))} />
              </div>
              <div>
                <Label>{t('accounts.form.maxUsers')}</Label>
                <Input data-testid="account-input-maxUsers" type="number" value={form.max_users} onChange={(e) => setForm((f) => ({ ...f, max_users: +e.target.value }))} />
              </div>
              <div>
                <Label>{t('accounts.form.maxDoors')}</Label>
                <Input data-testid="account-input-maxDoors" type="number" value={form.max_doors} onChange={(e) => setForm((f) => ({ ...f, max_doors: +e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button data-testid="account-button-cancelCreate" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              <Button data-testid="account-button-submitCreate" onClick={handleSubmit} disabled={submitting} className="flex-1 bg-[#F97316] hover:bg-[#EA580C]">
                {submitting ? 'Creating...' : t('accounts.createAccount')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
