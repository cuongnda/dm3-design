import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  DataTable,
  type Column,
  Button,
  AppModal,
  Input,
  Label,
  Select,
  SelectOption,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import type { VisitDTO } from '@dm3/api-client';
import {
  useVisitsList,
  useCreateVisit,
  useApproveVisit,
  useCheckinVisit,
  useCheckoutVisit,
} from '@/features/manage/visitors/hooks/useVisitors';

const STATUS_COLORS: Record<string, string> = {
  pre_registered: 'text-blue-400',
  approved: 'text-cyan-400',
  waiting: 'text-warning',
  checked_in: 'text-success',
  checked_out: 'text-muted-foreground',
  cancelled: 'text-destructive',
  no_show: 'text-orange-400',
  rejected: 'text-destructive',
};

const PURPOSES = ['meeting', 'interview', 'delivery', 'maintenance', 'tour', 'contract_signing', 'other'] as const;

export function VisitorPreRegisterPage() {
  const { t } = useTranslation('manage');
  const [page, setPage] = useState(1);
  const params = { page, limit: 20, status: 'pre_registered' };
  const { data: visitsData, isLoading, error } = useVisitsList(params);
  const approveMutation = useApproveVisit();

  const visits = visitsData?.data ?? [];
  const total = visitsData?.total ?? 0;

  const handleApprove = useCallback((id: string) => approveMutation.mutate(id), [approveMutation]);

  const columns: Column<VisitDTO>[] = [
    {
      key: 'visitor',
      header: t('visitors.table.name'),
      render: (r) => (
        <div>
          <span className="font-medium text-foreground">
            {r.visitor ? `${r.visitor.first_name} ${r.visitor.last_name}` : r.visitor_id}
          </span>
          {r.visitor?.company && (
            <span className="block text-[11px] text-muted-foreground">{r.visitor.company}</span>
          )}
        </div>
      ),
    },
    {
      key: 'host',
      header: t('visitors.table.host'),
      render: (r) => <span className="text-muted-foreground">{r.host?.name ?? r.host_user_id}</span>,
    },
    {
      key: 'purpose',
      header: t('visitors.table.purpose'),
      render: (r) => <span className="text-muted-foreground">{t(`visitors.purpose.${r.purpose}`)}</span>,
    },
    {
      key: 'expected_arrival',
      header: t('visitors.table.expectedTime'),
      width: '140px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(r.expected_arrival).toLocaleDateString()} {new Date(r.expected_arrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('visitors.table.status'),
      width: '120px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', STATUS_COLORS[r.status])}>
          {t(`visitors.status.${r.status}`)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      render: (r) => (
        r.status === 'pre_registered' ? (
          <Button size="xs" className="bg-cyan-600 hover:bg-cyan-700" onClick={() => handleApprove(r.id)}>
            {t('visitors.actions.approve')}
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('visitors.preRegister', 'Pre-register Visitors')}
        description={t('visitors.preRegisterDescription', 'View and manage pre-registered visits pending approval')}
      />
      {error ? (
        <div className="text-center py-12 text-destructive">{t('visitors.error')}</div>
      ) : isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.loading')}</div>
      ) : visits.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.noVisits', 'No pre-registered visits')}</div>
      ) : (
        <>
          <DataTable columns={columns} data={visits} rowKey={(r) => r.id} />
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
              <span className="text-[12px] text-muted-foreground py-1">Page {page} of {Math.ceil(total / 20)}</span>
              <Button size="xs" variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
