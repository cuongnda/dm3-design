import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader, DataTable, type Column, Button } from '@dm3/ui';
import { Clock, Download } from 'lucide-react';
import {
  listAttendanceRecords,
  getAttendanceDailySummary,
  type AttendanceRecordDTO,
  type AttendanceStatus,
} from '@dm3/api-client';

// The daily records view is the Sprint 1 deliverable. It lists everyone who
// showed up today (or for the selected date) with clock_in / clock_out /
// method / status, backed by the attend-svc /records endpoint. The status
// strip across the top is a second query because summary counts are cheaper
// server-side than derivable from a paged list.

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  pending: 'bg-gray-500/20 text-gray-300',
  on_time: 'bg-emerald-500/20 text-emerald-400',
  late: 'bg-amber-500/20 text-amber-400',
  absent: 'bg-red-500/20 text-red-400',
  on_leave: 'bg-blue-500/20 text-blue-400',
  half_day: 'bg-indigo-500/20 text-indigo-400',
  holiday: 'bg-purple-500/20 text-purple-400',
};

function StatusBadge({ status }: { status: AttendanceStatus }) {
  const cls = STATUS_STYLE[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function formatTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function todayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function AttendanceDailyPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayIso());
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    queryKey: ['attendance-records', date, statusFilter, search, page],
    queryFn: () =>
      listAttendanceRecords({
        date,
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        limit: 25,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ['attendance-summary', date],
    queryFn: () => getAttendanceDailySummary({ date }),
  });

  const records = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  const summary = summaryQuery.data;

  const columns = useMemo<Column<AttendanceRecordDTO>[]>(
    () => [
      {
        key: 'user_name',
        header: t('attendance.table.name'),
        render: (r) => (
          <Link
            to={`/manage/attendance/person/${r.user_id}`}
            className="block leading-tight hover:text-[#3B82F6]"
            data-testid={`attendance-link-person-${r.user_id}`}
          >
            <div className="text-foreground text-[13px] font-medium hover:text-[#3B82F6]">
              {r.user_name || r.user_id.slice(0, 8)}
            </div>
            {r.user_email && <div className="text-[11px] text-muted-foreground">{r.user_email}</div>}
          </Link>
        ),
      },
      {
        key: 'shift_name',
        header: t('attendance.table.shift'),
        width: '180px',
        render: (r) =>
          r.shift_name ? (
            <div className="text-[12px]">
              <div className="text-foreground">{r.shift_name}</div>
              <div className="font-mono text-muted-foreground text-[11px]">{r.shift_start}–{r.shift_end}</div>
            </div>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'clock_in',
        header: t('attendance.table.checkIn'),
        width: '100px',
        render: (r) => <span className="font-mono text-[12px] text-foreground">{formatTime(r.clock_in)}</span>,
      },
      {
        key: 'clock_out',
        header: t('attendance.table.checkOut'),
        width: '100px',
        render: (r) =>
          r.clock_out ? (
            <span className="font-mono text-[12px] text-foreground">{formatTime(r.clock_out)}</span>
          ) : r.clock_in ? (
            <span className="text-[12px] text-amber-400">In</span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'total_hours',
        header: t('attendance.table.hours'),
        width: '80px',
        render: (r) =>
          r.total_hours != null ? (
            <span className="font-mono text-[12px] text-foreground">{r.total_hours.toFixed(2)}</span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'late_minutes',
        header: t('attendance.status.late'),
        width: '70px',
        render: (r) =>
          r.late_minutes > 0 ? (
            <span className="text-[12px] text-amber-400">{r.late_minutes}m</span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'status',
        header: t('attendance.table.status'),
        width: '110px',
        render: (r) => <StatusBadge status={r.status} />,
      },
    ],
    [t],
  );

  return (
    <div>
      <PageHeader title={t('attendance.title')} description={t('attendance.description')}>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-input-date"
        />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as AttendanceStatus | '');
            setPage(1);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-select-status"
        >
          <option value="">{t('attendance.tabs.all')}</option>
          <option value="on_time">{t('attendance.status.onTime')}</option>
          <option value="late">{t('attendance.status.late')}</option>
          <option value="absent">{t('attendance.status.absent')}</option>
          <option value="on_leave">{t('attendance.status.leave')}</option>
          <option value="half_day">{t('attendance.status.halfDay')}</option>
          <option value="pending">Pending</option>
        </select>
        <input
          type="search"
          placeholder={t('attendance.searchPlaceholder')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-8 w-56 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-input-search"
        />
        <Button size="sm" variant="outline" disabled data-testid="attendance-button-export">
          <Download size={14} className="mr-1" />
          {t('attendance.export')}
        </Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <SummaryCell label={t('attendance.stats.onTime')} value={summary?.on_time} tone="emerald" />
        <SummaryCell label={t('attendance.stats.late')} value={summary?.late} tone="amber" />
        <SummaryCell label={t('attendance.stats.absent')} value={summary?.absent} tone="red" />
        <SummaryCell label={t('attendance.stats.leave')} value={summary?.on_leave} tone="blue" />
        <SummaryCell label="Clocked in" value={summary?.clocked_in} tone="cyan" />
        <SummaryCell label="Total" value={summary?.total} tone="gray" />
      </div>

      {listQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading attendance…</div>
      ) : (
        <DataTable
          columns={columns}
          data={records}
          rowKey={(r) => r.id}
          pageSize={25}
          emptyIcon={<Clock size={32} strokeWidth={1.2} />}
          emptyTitle={statusFilter || search ? 'No matching records' : 'No attendance yet for this day'}
          emptyDescription={
            statusFilter || search
              ? 'Try clearing filters or picking a different date.'
              : 'Records appear automatically when users trigger access devices configured as attendance terminals.'
          }
          emptyAction={
            statusFilter || search
              ? {
                  label: 'Clear filters',
                  variant: 'outline',
                  onClick: () => {
                    setStatusFilter('');
                    setSearch('');
                    setPage(1);
                  },
                  'data-testid': 'attendance-button-clear-filters',
                }
              : undefined
          }
        />
      )}

      {total > 25 && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / 25))} · {total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              data-testid="attendance-button-prev-page"
            >
              Prev
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={page >= Math.ceil(total / 25)}
              onClick={() => setPage((p) => p + 1)}
              data-testid="attendance-button-next-page"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SummaryCellProps {
  label: string;
  value?: number;
  tone: 'emerald' | 'amber' | 'red' | 'blue' | 'cyan' | 'gray';
}

const TONE_CLASSES: Record<SummaryCellProps['tone'], string> = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  cyan: 'text-cyan-400',
  gray: 'text-foreground',
};

function SummaryCell({ label, value, tone }: SummaryCellProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>{value ?? '—'}</div>
    </div>
  );
}
