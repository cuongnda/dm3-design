import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Plus, Search } from 'lucide-react';
import { fetchCompanies, type CompanyDTO } from '@/lib/api';
import { Button, DataTable, Input, TablePaginationFooter } from '@dm3/ui';
import { CreateCompanyModal } from './CreateCompanyModal';

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
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const pageSize = 20;
  const navigate = useNavigate();

  const loadCompanies = useCallback(() => {
    setLoading(true);
    fetchCompanies()
      .then(setCompanies)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const filtered = useMemo(() => {
    if (!search) return companies;
    const q = search.toLowerCase();
    return companies.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)
    );
  }, [companies, search]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden p-6">
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold text-foreground">{t('companies.title')}</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {companies.length} registered {companies.length === 1 ? 'company' : 'companies'}
          </p>
        </div>
        <Button
          data-testid="company-button-create"
          onClick={() => setShowCreateModal(true)}
          className="gap-2"
        >
          <Plus size={15} />
          {t('companies.createCompany')}
        </Button>
      </div>

      {/* Search */}
      <div className="shrink-0 relative max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="company-input-search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder={t('companies.searchPlaceholder')}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="min-h-0 flex-1 overflow-auto">
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            loading={loading}
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
            data={paged}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/system/companies/${c.id}`)}
            emptyMessage={search ? 'No companies match your search' : 'No companies yet'}
            emptyIcon={<Building2 size={32} strokeWidth={1.2} />}
          />
        </div>
        <TablePaginationFooter
          page={page}
          pageSize={pageSize}
          total={filtered.length}
          totalPages={totalPages}
          onPageChange={setPage}
          loading={loading}
        />
      </div>

      <CreateCompanyModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreated={loadCompanies}
      />
    </div>
  );
}
