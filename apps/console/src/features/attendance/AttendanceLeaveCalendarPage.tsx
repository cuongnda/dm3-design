import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, Button } from '@dm3/ui';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  getLeaveCalendar,
  type LeaveCalendarEntryDTO,
  type LeaveCalendarStatus,
} from '@dm3/api-client';

// AttendanceLeaveCalendarPage — month-view of approved/pending leave and
// holidays. The server returns overlapping date ranges; this page normalizes
// each entry onto every day it covers so we can render per-day chips.

const STATUS_TONE: Record<LeaveCalendarStatus, string> = {
  approved: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
  pending: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
  rejected: 'border-red-500/50 bg-red-500/10 text-red-300',
  cancelled: 'border-gray-500/50 bg-gray-500/10 text-muted-foreground',
  holiday: 'border-purple-500/50 bg-purple-500/10 text-purple-300',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

// Monday-start grid: include the preceding days needed to fill the first row.
function calendarGridStart(monthStart: Date): Date {
  const offset = (monthStart.getDay() + 6) % 7; // Mon=0..Sun=6
  const start = new Date(monthStart);
  start.setDate(start.getDate() - offset);
  return start;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function expandEntry(entry: LeaveCalendarEntryDTO): string[] {
  const out: string[] = [];
  const start = new Date(`${entry.start_date}T00:00:00`);
  const end = new Date(`${entry.end_date}T00:00:00`);
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function AttendanceLeaveCalendarPage() {
  const [anchor, setAnchor] = useState<Date>(startOfMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState<'approved' | 'pending' | 'all'>('all');

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = calendarGridStart(monthStart);
  const totalCells = 42; // 6 rows x 7 cols, covers any month

  const calendarQ = useQuery({
    queryKey: ['leave-calendar', ymd(monthStart), ymd(monthEnd), statusFilter],
    queryFn: () =>
      getLeaveCalendar({
        from: ymd(monthStart),
        to: ymd(monthEnd),
        status: statusFilter,
      }),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, LeaveCalendarEntryDTO[]>();
    (calendarQ.data ?? []).forEach((entry) => {
      expandEntry(entry).forEach((day) => {
        const bucket = map.get(day);
        if (bucket) bucket.push(entry);
        else map.set(day, [entry]);
      });
    });
    return map;
  }, [calendarQ.data]);

  const totals = useMemo(() => {
    const t = { approved: 0, pending: 0, holiday: 0 };
    (calendarQ.data ?? []).forEach((e) => {
      if (e.type === 'holiday') t.holiday += 1;
      else if (e.status === 'approved') t.approved += 1;
      else if (e.status === 'pending') t.pending += 1;
    });
    return t;
  }, [calendarQ.data]);

  const todayStr = ymd(new Date());

  return (
    <div>
      <PageHeader
        title="Leave calendar"
        description="Team-wide view of approved leave, pending requests, and holidays."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAnchor(startOfMonth(new Date()))}
          data-testid="attendance-button-calendar-today"
        >
          Today
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAnchor(startOfMonth(addDays(monthStart, -1)))}
          data-testid="attendance-button-calendar-prev"
        >
          <ChevronLeft size={14} />
        </Button>
        <div className="w-40 text-center text-[13px] font-medium capitalize text-foreground">
          {monthLabel(monthStart)}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAnchor(startOfMonth(addDays(monthEnd, 1)))}
          data-testid="attendance-button-calendar-next"
        >
          <ChevronRight size={14} />
        </Button>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'approved' | 'pending' | 'all')
          }
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-select-calendar-status"
        >
          <option value="all">All</option>
          <option value="approved">Approved only</option>
          <option value="pending">Pending only</option>
        </select>
      </PageHeader>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-[12px]">
        <LegendSwatch className="bg-emerald-500/20 border-emerald-500/50" label={`Approved · ${totals.approved}`} />
        <LegendSwatch className="bg-amber-500/20 border-amber-500/50" label={`Pending · ${totals.pending}`} />
        <LegendSwatch className="bg-purple-500/20 border-purple-500/50" label={`Holiday · ${totals.holiday}`} />
      </div>

      {calendarQ.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-[13px] text-destructive">
          Failed to load calendar:{' '}
          {calendarQ.error instanceof Error ? calendarQ.error.message : 'unknown error'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
              <div key={label} className="border-r border-border px-2 py-1.5 last:border-r-0">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: totalCells }, (_, i) => {
              const day = addDays(gridStart, i);
              const dayKey = ymd(day);
              const inMonth = day.getMonth() === monthStart.getMonth();
              const isToday = dayKey === todayStr;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              const entries = byDay.get(dayKey) ?? [];
              return (
                <div
                  key={dayKey}
                  className={`min-h-[96px] border-b border-r border-border p-1.5 last-in-row:border-r-0 ${
                    inMonth ? 'bg-card' : 'bg-background/40'
                  } ${isWeekend && inMonth ? 'bg-muted/10' : ''}`}
                  data-testid={`attendance-calendar-cell-${dayKey}`}
                >
                  <div
                    className={`mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
                      isToday
                        ? 'bg-[#3B82F6] font-semibold text-white'
                        : inMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {day.getDate()}
                  </div>
                  <div className="space-y-1">
                    {entries.slice(0, 3).map((e, idx) => (
                      <CalendarChip key={`${dayKey}-${idx}`} entry={e} />
                    ))}
                    {entries.length > 3 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{entries.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {calendarQ.isLoading && (
        <div className="mt-3 text-center text-[12px] text-muted-foreground">
          Loading calendar…
        </div>
      )}

      {!calendarQ.isLoading && (calendarQ.data ?? []).length === 0 && (
        <div className="mt-3 flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
          <CalendarDays size={32} strokeWidth={1.2} />
          <div className="text-[13px]">No leave or holidays in this window.</div>
        </div>
      )}
    </div>
  );
}

function CalendarChip({ entry }: { entry: LeaveCalendarEntryDTO }) {
  const statusKey: LeaveCalendarStatus =
    entry.type === 'holiday' ? 'holiday' : entry.status ?? 'pending';
  const tone = STATUS_TONE[statusKey];
  const label =
    entry.title ||
    (entry.type === 'holiday'
      ? entry.policy_name || 'Holiday'
      : [entry.user_name, entry.policy_code].filter(Boolean).join(' · ') ||
        'Leave');
  const styleOverride =
    entry.color && entry.type !== 'holiday'
      ? { borderColor: entry.color, background: `${entry.color}1A`, color: entry.color }
      : undefined;

  return (
    <div
      className={`truncate rounded border px-1 py-0.5 text-[11px] ${tone}`}
      style={styleOverride}
      title={`${label}${entry.half_day ? ' (½)' : ''}`}
    >
      {entry.half_day && <span className="mr-1 opacity-70">½</span>}
      {label}
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded-sm border ${className}`} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
