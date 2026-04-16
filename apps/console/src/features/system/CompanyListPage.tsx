import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Plus, Search } from 'lucide-react';
import { fetchCompanies, type CompanyDTO } from '@/lib/api';
import { Button, DataTable, Input } from '@dm3/ui';

const planColors: Record<string, string> = {
  trial: 'bg-warning/10 text-warning',
  starter: 'bg-secure/10 text-secure',
  professional: 'bg-manage/10 text-manage',
  enterprise: 'bg-operate/10 text-operate',
};

const statusColors: Record<string, string> = {
  active: 'bg-success/10 text-success',
  suspended: 'bg-error/10 text-error',
  trial: 'bg-warning/10 text-warning',
};

export function CompanyListPage() {
  const { t } = useTranslation('system');
  const [companies, setCompanies] = useState<CompanyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    fetchCompanies()
      .then(setCompanies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [companies, search]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">{t('companies.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {companies.length} registered {companies.length === 1 ? 'company' : 'companies'}
          </p>
        </div>
        <Button
          data-testid="company-button-create"
          onClick={() => navigate('/system/companies/new')}
          className="gap-2"
        >
          <Plus size={15} />
          {t('companies.createCompany')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="company-input-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('companies.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center">
          <div className="w-5 h-5 border-2 border-ring/30 border-t-ring rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card py-12 text-center">
          <Building2 size={32} className="mx-auto text-muted-foreground/40 mb-2" />
          <p className="text-[13px] text-muted-foreground">
            {search ? 'No companies match your search' : 'No companies yet'}
          </p>
        </div>
      ) : (
        <DataTable
          data-testid="company-table-list"
          rowTestId={(c) => `company-row-${c.id}`}
          columns={[
            { key: 'name', header: t('companies.table.name'), sortable: true, render: (c) => <span className="font-medium">{c.name}</span> },
            { key: 'code', header: t('companies.table.code'), sortable: true, render: (c) => <span className="font-mono">{c.code}</span> },
            {
              key: 'plan',
              header: t('companies.table.plan'),
              sortable: true,
              render: (c) => (
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${planColors[c.plan] || planColors.trial}`}>
                  {c.plan}
                </span>
              ),
            },
            {
              key: 'status',
              header: t('companies.table.status'),
              sortable: true,
              render: (c) => (
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize ${statusColors[c.status] || statusColors.active}`}>
                  {c.status}
                </span>
              ),
            },
            { key: 'user_count', header: t('companies.table.users'), sortable: true, render: (c) => <span className="tabular-nums">{c.user_count ?? 0}</span> },
            { key: 'device_count', header: t('companies.table.devices'), sortable: true, render: (c) => <span className="tabular-nums">{c.device_count ?? 0}</span> },
            { key: 'created_at', header: t('companies.table.created'), sortable: true, render: (c) => new Date(c.created_at).toLocaleDateString() },
          ]}
          data={filtered}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/system/companies/${c.id}`)}
          pageSize={15}
        />
      )}
    </div>
  );
}
