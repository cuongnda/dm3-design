import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CreditCard, Plus, Search } from 'lucide-react';
import { fetchAccounts, type AccountDTO } from '@/lib/api';
import { Button, Input, Select, SelectOption } from '@dm3/ui';

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

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-[#F8FAFC]">{t('accounts.title')}</h1>
          <p className="text-[13px] text-[#64748B]">{total} {t('accounts.description')}</p>
        </div>
        <button
          data-testid="account-button-create"
          onClick={() => navigate('/system/accounts/new')}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-md text-[13px] font-medium transition-colors"
        >
          <Plus size={15} />
          {t('accounts.createAccount')}
        </button>
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
        <select
          data-testid="account-select-status"
          value={statusFilter}
          onChange={(e) => {setStatusFilter(e.target.value); setPage(1);}}
          className="h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
        >
          <option value="">{t('accounts.filters.allStatuses')}</option>
          <option value="active">{t('accounts.filters.active')}</option>
          <option value="suspended">{t('accounts.filters.suspended')}</option>
          <option value="deactivated">{t('accounts.filters.deactivated')}</option>
        </select>
        <select
          data-testid="account-select-plan"
          value={planFilter}
          onChange={(e) => {setPlanFilter(e.target.value); setPage(1);}}
          className="h-9 px-3 bg-[#0B1120] border border-[#1E293B] rounded-md text-[13px] text-[#F8FAFC] focus:border-[#F97316] focus:outline-none"
        >
          <option value="">{t('accounts.filters.allPlans')}</option>
          <option value="starter">Starter</option>
          <option value="professional">Professional</option>
          <option value="enterprise">Enterprise</option>
        </select>
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

    </div>
  );
}