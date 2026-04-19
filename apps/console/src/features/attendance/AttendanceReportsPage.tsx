import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  type Column,
} from '@dm3/ui';
import { BarChart3, Download, RefreshCw } from 'lucide-react';
import {
  getAttendanceReport,
  type ReportUserRowDTO,
} from '@dm3/api-client';

// AttendanceReportsPage — tenant-wide summary across a date range.
// Server returns KPI totals + per-user rows in a single call so the page
// renders without a waterfall of requests.

function formatHours(h: number) {
  return h.toFixed(1);
}

function defaultFromIso() {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return isoDay(d);
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function todayIso() {
  return isoDay(new Date());
}

function downloadCsv(rows: ReportUserRowDTO[], from: string, to: string) {
  const headers = [
    'user_id',
    'user_name',
    'user_email',
    'record_count',
    'on_time',
    'late',
    'absent',
    'on_leave',
    'total_hours',
    'regular_hours',
    'overtime_hours',
    'approved_overtime_hours',
    'late_minutes',
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.user_id,
        JSON.stringify(r.user_name || ''),
        JSON.stringify(r.user_email || ''),
        r.record_count,
        r.on_time_count,
        r.late_count,
        r.absent_count,
        r.on_leave_count,
        r.total_hours.toFixed(2),
        r.regular_hours.toFixed(2),
        r.overtime_hours.toFixed(2),
        r.approved_overtime_hours.toFixed(2),
        r.late_minutes,
      ].join(','),
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-report_${from}_to_${to}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AttendanceReportsPage() {
  const [from, setFrom] = useState(defaultFromIso());
  const [to, setTo] = useState(todayIso());

  const reportQ = useQuery({
    queryKey: ['attendance-report', from, to],
    queryFn: () => getAttendanceReport(from, to),
    enabled: Boolean(from) && Boolean(to),
  });

  const summary = reportQ.data?.summary;
  const users = reportQ.data?.users ?? [];

  const columns = useMemo<Column<ReportUserRowDTO>[]>(
    () => [
      {
        key: 'user',
        header: 'User',
        render: (r) => (
          <div className="leading-tight">
            <div className="text-[13px] font-medium text-foreground">
              {r.user_name || r.user_id.slice(0, 8)}
            </div>
            {r.user_email && (
              <div className="text-[11px] text-muted-foreground">{r.user_email}</div>
            )}
          </div>
        ),
      },
      {
        key: 'days',
        header: 'Days',
        width: '80px',
        render: (r) => <span className="text-[12px] font-mono">{r.record_count}</span>,
      },
      {
        key: 'on_time',
        header: 'On-time',
        width: '80px',
        render: (r) => (
          <span className="text-[12px] font-mono text-emerald-300">
            {r.on_time_count}
          </span>
        ),
      },
      {
        key: 'late',
        header: 'Late',
        width: '80px',
        render: (r) => (
          <span className="text-[12px] font-mono text-amber-300">{r.late_count}</span>
        ),
      },
      {
        key: 'absent',
        header: 'Absent',
        width: '80px',
        render: (r) => (
          <span className="text-[12px] font-mono text-red-300">{r.absent_count}</span>
        ),
      },
      {
        key: 'leave',
        header: 'Leave',
        width: '80px',
        render: (r) => (
          <span className="text-[12px] font-mono text-sky-300">{r.on_leave_count}</span>
        ),
      },
      {
        key: 'total_h',
        header: 'Total h',
        width: '90px',
        render: (r) => (
          <span className="text-[12px] font-mono">{formatHours(r.total_hours)}</span>
        ),
      },
      {
        key: 'ot_h',
        header: 'OT h',
        width: '100px',
        render: (r) => (
          <div className="leading-tight">
            <div className="text-[12px] font-mono text-amber-300">
              {formatHours(r.overtime_hours)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {formatHours(r.approved_overtime_hours)} approved
            </div>
          </div>
        ),
      },
      {
        key: 'late_min',
        header: 'Late mins',
        width: '90px',
        render: (r) => (
          <span className="text-[12px] font-mono text-muted-foreground">
            {r.late_minutes}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Attendance reports"
        description="Summary across a date range with per-user breakdown."
      >
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-8 w-36 text-[13px]"
          data-testid="attendance-input-report-from"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-8 w-36 text-[13px]"
          data-testid="attendance-input-report-to"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => reportQ.refetch()}
          disabled={reportQ.isFetching}
          data-testid="attendance-button-report-refresh"
        >
          <RefreshCw size={14} className={`mr-1 ${reportQ.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => downloadCsv(users, from, to)}
          disabled={users.length === 0}
          data-testid="attendance-button-report-export"
        >
          <Download size={14} className="mr-1" /> Export CSV
        </Button>
      </PageHeader>

      {reportQ.isError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {(reportQ.error as Error).message}
        </div>
      )}

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <KpiCard label="Users" value={summary.total_users} />
          <KpiCard label="Records" value={summary.total_records} />
          <KpiCard
            label="On-time"
            value={summary.on_time_count}
            tone="emerald"
          />
          <KpiCard label="Late" value={summary.late_count} tone="amber" />
          <KpiCard label="Absent" value={summary.absent_count} tone="red" />
          <KpiCard
            label="Total hours"
            value={formatHours(summary.total_hours)}
          />
          <KpiCard
            label="OT hours"
            value={formatHours(summary.overtime_hours)}
            tone="amber"
            sub={`${formatHours(summary.approved_overtime_hours)} approved`}
          />
        </div>
      )}

      {summary && summary.pending_overtime_count > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300">
          {summary.pending_overtime_count} overtime record
          {summary.pending_overtime_count === 1 ? '' : 's'} still awaiting review.
        </div>
      )}

      {reportQ.isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading report…
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={users}
          rowKey={(r) => r.user_id}
          pageSize={50}
          emptyIcon={<BarChart3 size={32} strokeWidth={1.2} />}
          emptyTitle="No attendance in this range"
          emptyDescription="Try a different date window."
        />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: 'emerald' | 'amber' | 'red';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-300'
      : tone === 'amber'
        ? 'text-amber-300'
        : tone === 'red'
          ? 'text-red-300'
          : 'text-foreground';
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-[20px] font-semibold ${toneClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
