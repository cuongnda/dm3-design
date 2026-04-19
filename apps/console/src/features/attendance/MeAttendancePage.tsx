import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, DataTable, Input, type Column } from '@dm3/ui';
import { Clock } from 'lucide-react';
import {
  getMeAttendance,
  type AttendanceRecordDTO,
  type AttendanceStatus,
  type MeAttendanceToday,
} from '@dm3/api-client';

// MeAttendancePage — self-service view of the authenticated user's own
// attendance. Calls /api/v1/attendance/me/attendance which server-side scopes
// rows to claims.Sub, so an employee can only ever see themselves here.
// Renders a "Today" clock card, a summary strip, and the 30-day (by default)
// record list.

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
    <span
      className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${cls}`}
      data-testid="attendance-badge-status"
    >
      {status.replace('_', ' ')}
    </span>
  );
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatHours(hours?: number): string {
  if (hours === undefined || hours === null) return '—';
  return `${hours.toFixed(2)}h`;
}

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function TodayCard({ today }: { today: MeAttendanceToday }) {
  return (
    <section
      className="rounded-lg border border-border bg-card p-5"
      data-testid="attendance-card-today"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>Today · {formatDate(today.date)}</span>
        <StatusBadge status={today.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Clock in
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatTime(today.clock_in)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Clock out
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatTime(today.clock_out)}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Shift
          </div>
          <div className="mt-1 text-sm font-medium text-foreground">
            {today.shift_name || '—'}
            {today.shift_start && today.shift_end ? (
              <span className="ml-1 text-xs text-muted-foreground">
                {today.shift_start}–{today.shift_end}
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Hours
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">
            {formatHours(today.total_hours)}
          </div>
        </div>
      </div>
    </section>
  );
}

interface StatTileProps {
  label: string;
  value: string | number;
  tone?: string;
}

function StatTile({ label, value, tone }: StatTileProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={`mt-1 text-lg font-semibold ${tone ?? 'text-foreground'}`}
      >
        {value}
      </div>
    </div>
  );
}

export function MeAttendancePage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  const meQ = useQuery({
    queryKey: ['me-attendance', from, to],
    queryFn: () => getMeAttendance({ from, to }),
  });

  const data = meQ.data;

  const columns: Column<AttendanceRecordDTO>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (r) => (
        <span className="text-sm text-foreground">{formatDate(r.date)}</span>
      ),
    },
    {
      key: 'shift',
      header: 'Shift',
      render: (r) =>
        r.shift_name ? (
          <span className="text-sm">
            {r.shift_name}
            {r.shift_start && r.shift_end ? (
              <span className="ml-1 text-xs text-muted-foreground">
                {r.shift_start}–{r.shift_end}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'clock_in',
      header: 'Clock in',
      render: (r) => <span className="tabular-nums">{formatTime(r.clock_in)}</span>,
    },
    {
      key: 'clock_out',
      header: 'Clock out',
      render: (r) => <span className="tabular-nums">{formatTime(r.clock_out)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: 'hours',
      header: 'Hours',
      render: (r) => (
        <span className="tabular-nums">{formatHours(r.total_hours)}</span>
      ),
    },
    {
      key: 'ot',
      header: 'OT',
      render: (r) => (
        <span className="tabular-nums text-amber-400">
          {formatHours(r.overtime_hours)}
        </span>
      ),
    },
    {
      key: 'late',
      header: 'Late (min)',
      render: (r) =>
        r.late_minutes > 0 ? (
          <span className="tabular-nums text-amber-400">{r.late_minutes}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="My attendance"
        description="Your own clock-in history, hours, and leave over the selected window."
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            From
          </label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-40"
            data-testid="attendance-input-from"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            To
          </label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-40"
            data-testid="attendance-input-to"
          />
        </div>
      </div>

      {data?.today ? <TodayCard today={data.today} /> : null}

      {data ? (
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8"
          data-testid="attendance-summary-strip"
        >
          <StatTile
            label="On time"
            value={data.summary.on_time}
            tone="text-emerald-400"
          />
          <StatTile label="Late" value={data.summary.late} tone="text-amber-400" />
          <StatTile label="Absent" value={data.summary.absent} tone="text-red-400" />
          <StatTile
            label="On leave"
            value={data.summary.on_leave}
            tone="text-blue-400"
          />
          <StatTile
            label="Half day"
            value={data.summary.half_day}
            tone="text-indigo-400"
          />
          <StatTile
            label="Hours"
            value={data.summary.total_hours.toFixed(1)}
          />
          <StatTile
            label="OT hours"
            value={data.summary.ot_hours.toFixed(1)}
            tone="text-amber-400"
          />
          <StatTile
            label="Late (min)"
            value={data.summary.late_minutes}
            tone="text-amber-400"
          />
        </section>
      ) : null}

      <div className="flex-1 overflow-auto">
        <DataTable
          data={data?.records ?? []}
          columns={columns}
          loading={meQ.isLoading}
          emptyMessage="No attendance records in this window."
          rowKey={(r) => r.id}
          paginate={false}
          data-testid="attendance-table-me"
        />
      </div>
    </div>
  );
}
