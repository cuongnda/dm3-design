import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  PageHeader,
  DataTable,
  type Column,
  Button,
  AppModal,
  useToast,
} from '@dm3/ui';
import { ArrowLeft, PencilLine, Clock } from 'lucide-react';
import {
  listAttendanceRecords,
  adjustAttendanceRecord,
  type AttendanceRecordDTO,
  type AttendanceStatus,
  type AdjustAttendanceRecordInput,
} from '@dm3/api-client';

// AttendancePersonPage: a single person's attendance over a date window.
// Use case: HR or a manager clicks a user in the daily list, lands here, and
// gets a history ribbon + an adjustment drawer to patch clock_in / clock_out /
// status without leaving the page. Manual adjustments carry an auditable
// `adjustment_reason` so the BR-ATT-004 cron knows not to overwrite them.

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

function formatDate(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function firstDayOfThisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Converts an ISO timestamp to a value suitable for <input type="datetime-local">
// which needs "YYYY-MM-DDTHH:MM" in the user's local timezone.
function toLocalInputValue(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local datetime-local strings must be sent to the server as a proper ISO
// timestamp so the backend knows the timezone. We let JS's Date parse the
// local string (no timezone → uses local) then serialize to UTC ISO.
function fromLocalInputValue(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function AttendancePersonPage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const [from, setFrom] = useState(firstDayOfThisMonth());
  const [to, setTo] = useState(todayIso());
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AttendanceRecordDTO | null>(null);

  const listQuery = useQuery({
    queryKey: ['attendance-person', userId, from, to, page],
    enabled: Boolean(userId),
    queryFn: () =>
      listAttendanceRecords({
        user_id: userId!,
        from,
        to,
        page,
        limit: 50,
      }),
  });

  const records = listQuery.data?.data ?? [];
  const total = listQuery.data?.total ?? 0;
  // Header uses the first record's user_name/email — they're all the same user.
  const userLabel = records[0]?.user_name || userId?.slice(0, 8) || 'Unknown';
  const userEmail = records[0]?.user_email;

  const aggregate = useMemo(() => {
    const sum = { hours: 0, regular: 0, overtime: 0, late: 0, absent: 0 };
    records.forEach((r) => {
      if (r.total_hours) sum.hours += r.total_hours;
      if (r.regular_hours) sum.regular += r.regular_hours;
      if (r.overtime_hours) sum.overtime += r.overtime_hours;
      if (r.status === 'late') sum.late += 1;
      if (r.status === 'absent') sum.absent += 1;
    });
    return sum;
  }, [records]);

  const columns = useMemo<Column<AttendanceRecordDTO>[]>(
    () => [
      {
        key: 'date',
        header: 'Date',
        width: '120px',
        render: (r) => (
          <span className="text-[12px] text-foreground">{formatDate(r.date)}</span>
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
              <div className="font-mono text-muted-foreground text-[11px]">
                {r.shift_start}–{r.shift_end}
              </div>
            </div>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'clock_in',
        header: t('attendance.table.checkIn'),
        width: '110px',
        render: (r) => (
          <span className="font-mono text-[12px]">{formatTime(r.clock_in)}</span>
        ),
      },
      {
        key: 'clock_out',
        header: t('attendance.table.checkOut'),
        width: '110px',
        render: (r) =>
          r.clock_out ? (
            <span className="font-mono text-[12px]">{formatTime(r.clock_out)}</span>
          ) : r.clock_in ? (
            <span className="text-[12px] text-amber-400">Still in</span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'total_hours',
        header: 'Hours',
        width: '80px',
        render: (r) =>
          r.total_hours != null ? (
            <span className="font-mono text-[12px]">{r.total_hours.toFixed(2)}</span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'overtime_hours',
        header: 'OT',
        width: '70px',
        render: (r) =>
          r.overtime_hours && r.overtime_hours > 0 ? (
            <span className="font-mono text-[12px] text-amber-400">
              {r.overtime_hours.toFixed(2)}
              {!r.overtime_approved && <span className="ml-1 text-[10px]">?</span>}
            </span>
          ) : (
            <span className="text-[12px] text-muted-foreground">—</span>
          ),
      },
      {
        key: 'status',
        header: t('attendance.table.status'),
        width: '110px',
        render: (r) => (
          <div className="flex items-center gap-1">
            <StatusBadge status={r.status} />
            {r.manual_adjustment && (
              <span
                title={r.adjustment_reason || 'Manually adjusted'}
                className="text-[10px] px-1 rounded bg-cyan-500/20 text-cyan-300"
              >
                adj
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '60px',
        render: (r) => (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setEditing(r)}
            data-testid={`attendance-person-button-adjust-${r.id}`}
          >
            <PencilLine size={12} />
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <div>
      <PageHeader
        title={userLabel}
        description={userEmail || t('attendance.person.description', { defaultValue: 'Attendance history and manual adjustments.' })}
      >
        <Button asChild size="sm" variant="ghost" data-testid="attendance-person-button-back">
          <Link to="/manage/attendance">
            <ArrowLeft size={14} className="mr-1" />
            {t('common.back', { defaultValue: 'Back' })}
          </Link>
        </Button>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-person-input-from"
        />
        <span className="text-muted-foreground">–</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-person-input-to"
        />
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Records" value={total} />
        <Stat label="Hours" value={aggregate.hours.toFixed(2)} tone="cyan" />
        <Stat label="Regular" value={aggregate.regular.toFixed(2)} />
        <Stat label="Overtime" value={aggregate.overtime.toFixed(2)} tone="amber" />
        <Stat label="Absent / Late" value={`${aggregate.absent} / ${aggregate.late}`} tone="red" />
      </div>

      {listQuery.isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading history…</div>
      ) : (
        <DataTable
          columns={columns}
          data={records}
          rowKey={(r) => r.id}
          pageSize={50}
          emptyIcon={<Clock size={32} strokeWidth={1.2} />}
          emptyTitle="No records in this window"
          emptyDescription="Widen the date range or check that this user has a shift assigned."
        />
      )}

      {total > 50 && (
        <div className="mt-3 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / 50))} · {total} total
          </span>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={page >= Math.ceil(total / 50)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <AdjustmentModal
        record={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

interface StatProps {
  label: string;
  value: number | string;
  tone?: 'cyan' | 'amber' | 'red';
}
const TONE: Record<NonNullable<StatProps['tone']>, string> = {
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
};
function Stat({ label, value, tone }: StatProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${tone ? TONE[tone] : 'text-foreground'}`}>
        {value}
      </div>
    </div>
  );
}

// ─── Adjustment modal ─────────────────────────────────────────────────────

const STATUS_OPTIONS: AttendanceStatus[] = [
  'pending',
  'on_time',
  'late',
  'absent',
  'on_leave',
  'half_day',
  'holiday',
];

interface AdjustmentModalProps {
  record: AttendanceRecordDTO | null;
  onClose: () => void;
}

function AdjustmentModal({ record, onClose }: AdjustmentModalProps) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [status, setStatus] = useState<AttendanceStatus>('pending');
  const [leaveType, setLeaveType] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  // Hydrate when record changes.
  useMemoInit(record, (r) => {
    setClockIn(toLocalInputValue(r.clock_in));
    setClockOut(toLocalInputValue(r.clock_out));
    setStatus(r.status);
    setLeaveType(r.leave_type ?? '');
    setNotes(r.notes ?? '');
    setReason('');
  });

  const mutation = useMutation({
    mutationFn: (body: AdjustAttendanceRecordInput) => adjustAttendanceRecord(record!.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-person'] });
      qc.invalidateQueries({ queryKey: ['attendance-records'] });
      showToast({ type: 'success', title: 'Record updated', description: 'Adjustment saved.' });
      onClose();
    },
    onError: (err: Error) => {
      showToast({ type: 'error', title: 'Could not save', description: err.message });
    },
  });

  if (!record) return null;

  const canSave = reason.trim().length > 0 && !mutation.isPending;

  return (
    <AppModal
      open={record !== null}
      onOpenChange={(o) => !o && onClose()}
      title={`Adjust ${formatDate(record.date)}`}
      description={record.user_name || record.user_id.slice(0, 8)}
      size="lg"
      errorMessage={reason.trim().length === 0 ? 'A reason is required for audit.' : undefined}
      primaryAction={{
        label: mutation.isPending ? 'Saving…' : 'Save adjustment',
        disabled: !canSave,
        onClick: () => {
          mutation.mutate({
            clock_in: fromLocalInputValue(clockIn),
            clock_out: fromLocalInputValue(clockOut),
            status,
            leave_type: leaveType.trim() || null,
            notes: notes.trim() || null,
            adjustment_reason: reason.trim(),
            recalc: true,
          });
        },
        'data-testid': 'attendance-person-button-save-adjustment',
      }}
      showCancelButton
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Clock in">
          <input
            type="datetime-local"
            value={clockIn}
            onChange={(e) => setClockIn(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
            data-testid="attendance-person-input-clock-in"
          />
        </Field>
        <Field label="Clock out">
          <input
            type="datetime-local"
            value={clockOut}
            onChange={(e) => setClockOut(e.target.value)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
            data-testid="attendance-person-input-clock-out"
          />
        </Field>
        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
            data-testid="attendance-person-select-status"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Leave type (if on_leave)">
          <input
            type="text"
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            placeholder="annual, sick, unpaid…"
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
            data-testid="attendance-person-input-leave-type"
          />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-[13px]"
              data-testid="attendance-person-input-notes"
            />
          </Field>
        </div>
        <div className="col-span-2">
          <Field label="Adjustment reason (required for audit)">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. device offline, forgot to clock out"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-[13px]"
              data-testid="attendance-person-input-reason"
            />
          </Field>
        </div>
      </div>
    </AppModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

// useMemoInit runs the initializer whenever `dep` becomes a new truthy value
// (not on every render). Lets the modal hydrate its inputs when a new record
// is opened without a useEffect dependency dance.
function useMemoInit<T>(dep: T | null, init: (value: T) => void) {
  const [last, setLast] = useState<T | null>(null);
  if (dep && dep !== last) {
    setLast(dep);
    init(dep);
  }
}
