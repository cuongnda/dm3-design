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
import { listVisitorAccessLog, type VisitorAccessLogDTO } from '@dm3/api-client';

export function VisitorAccessHistoryPage() {
  const { t } = useTranslation('manage');
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['visitor-access-log', page, dateFrom, dateTo],
    queryFn: () => listVisitorAccessLog({
      page,
      limit: 20,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }),
  });

  const logs = data?.data ?? [];
  const total = data?.total ?? 0;

  const columns: Column<VisitorAccessLogDTO>[] = [
    {
      key: 'event_time', header: 'Time', width: '160px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(r.event_time).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      ),
    },
    { key: 'access_point_name', header: 'Access Point', render: (r) => <span className="font-medium">{r.access_point_name ?? r.access_point_id ?? '—'}</span> },
    { key: 'zone_name', header: 'Zone', width: '120px', render: (r) => <span className="text-muted-foreground text-[12px]">{r.zone_name ?? '—'}</span> },
    {
      key: 'direction', header: 'Direction', width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.direction === 'entry' ? 'text-emerald-400' : 'text-orange-400')}>
          {r.direction === 'entry' ? 'Entry' : r.direction === 'exit' ? 'Exit' : r.direction ?? '—'}
        </span>
      ),
    },
    {
      key: 'decision', header: 'Result', width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.decision === 'granted' ? 'text-emerald-400' : 'text-destructive')}>
          {r.decision === 'granted' ? 'Granted' : 'Denied'}
        </span>
      ),
    },
    { key: 'credential_type', header: 'Method', width: '100px', render: (r) => <span className="text-muted-foreground text-[12px]">{r.credential_type ?? '—'}</span> },
  ];

  return (
    <div>
      <PageHeader title="Visitor Access History" description="Track visitor entry and exit through access points">
        <div className="flex gap-2 items-center">
          <Input type="date" className="h-8 text-[12px] w-36" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} data-testid="visitors-input-history-from" />
          <span className="text-muted-foreground text-[12px]">to</span>
          <Input type="date" className="h-8 text-[12px] w-36" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} data-testid="visitors-input-history-to" />
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No access log entries found</div>
      ) : (
        <>
          <DataTable columns={columns} data={logs} rowKey={(r) => r.id} />
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
