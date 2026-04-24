import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  type Column,
  Button,
  Input,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import {
  getTopVisitors,
  listVisitorHistory,
  type VisitorAccessLogDTO,
  type TopVisitorDTO,
} from '@dm3/api-client';

export function VisitorAccessHistoryPage() {
  const { t } = useTranslation('manage');
  const [visitorId, setVisitorId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data: topVisitors = [] } = useQuery({
    queryKey: ['visitors-picker-top'],
    queryFn: () => getTopVisitors({ limit: 100 }),
  });
  const visitors: TopVisitorDTO[] = topVisitors;

  const { data, isLoading } = useQuery({
    queryKey: ['visitor-history', visitorId, page, dateFrom, dateTo],
    queryFn: () => listVisitorHistory(visitorId, {
      page,
      limit: 20,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }),
    enabled: !!visitorId,
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<VisitorAccessLogDTO>[] = [
    {
      key: 'event_time', header: t('visitors.history.columnTime'), width: '160px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(r.event_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
    { key: 'access_point_name', header: t('visitors.history.columnAccessPoint'), render: (r) => <span className="font-medium">{r.access_point_name ?? r.access_point_id ?? '—'}</span> },
    { key: 'zone_name', header: t('visitors.history.columnZone'), width: '120px', render: (r) => <span className="text-muted-foreground text-[12px]">{r.zone_name ?? '—'}</span> },
    {
      key: 'direction', header: t('visitors.history.columnDirection'), width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.direction === 'entry' ? 'text-emerald-400' : 'text-orange-400')}>
          {r.direction === 'entry' ? t('visitors.history.entryLabel') : r.direction === 'exit' ? t('visitors.history.exitLabel') : r.direction ?? '—'}
        </span>
      ),
    },
    {
      key: 'decision', header: t('visitors.history.columnResult'), width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.decision === 'granted' ? 'text-emerald-400' : 'text-destructive')}>
          {r.decision === 'granted' ? t('visitors.history.grantedLabel') : t('visitors.history.deniedLabel')}
        </span>
      ),
    },
    { key: 'credential_type', header: t('visitors.history.columnMethod'), width: '100px', render: (r) => <span className="text-muted-foreground text-[12px]">{r.credential_type ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title={t('visitors.history.title')} description={t('visitors.history.description')}>
        <div className="flex gap-2 items-center">
          <Input type="date" className="h-8 text-[12px] w-36" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} data-testid="visitors-input-history-from" />
          <span className="text-muted-foreground text-[12px]">{t('visitors.history.dateRangeSeparator')}</span>
          <Input type="date" className="h-8 text-[12px] w-36" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} data-testid="visitors-input-history-to" />
        </div>
      </PageHeader>

      <div className="flex gap-3 mb-4">
        <select
          className="h-8 text-[12px] rounded-md border border-input bg-background px-2 min-w-[260px]"
          value={visitorId}
          onChange={(e) => { setVisitorId(e.target.value); setPage(1); }}
          data-testid="visitors-select-history-visitor"
        >
          <option value="">{t('visitors.history.selectPlaceholder')}</option>
          {visitors.map((v) => (
            <option key={v.visitor_id} value={v.visitor_id}>
              {v.name}{v.company ? ` — ${v.company}` : ''} · {t('visitors.history.visitsCount', { count: v.visit_count })}
            </option>
          ))}
        </select>
      </div>

      {!visitorId ? (
        <div className="text-center py-12 text-muted-foreground text-[13px]">
          {t('visitors.history.selectPrompt')}
        </div>
      ) : isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.history.loading')}</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.history.noLogs')}</div>
      ) : (
        <>
          <DataTable columns={columns} data={logs} rowKey={(r) => r.id} />
          {total > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('visitors.history.prev')}</Button>
              <span className="text-[12px] text-muted-foreground py-1">{t('visitors.history.pageOf', { page, total: Math.ceil(total / 20) })}</span>
              <Button size="xs" variant="outline" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>{t('visitors.history.next')}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
