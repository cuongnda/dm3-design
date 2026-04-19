import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  AppModal,
  showToast,
  type Column,
} from '@dm3/ui';
import { Plus, X } from 'lucide-react';
import {
  getMeLeave,
  listLeavePolicies,
  createLeaveRequest,
  cancelLeaveRequest,
  type LeaveBalanceDTO,
  type LeaveRequestDTO,
  type LeavePolicyDTO,
  type LeaveStatus,
} from '@dm3/api-client';
import { useAuthStore } from '@/stores/authStore';

// MeLeavePage — self-service view of the authenticated user's own leave
// balances, past requests, and upcoming time off. Calls
// /api/v1/attendance/me/leave which is server-side scoped to claims.Sub.
// The employee can also file a new request here (passes their own user id
// to the existing POST /leave/requests handler).

const STATUS_TONE: Record<LeaveStatus, string> = {
  approved: 'bg-emerald-500/20 text-emerald-400',
  pending: 'bg-amber-500/20 text-amber-400',
  rejected: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-muted-foreground',
};

function StatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[11px] font-medium capitalize ${STATUS_TONE[status]}`}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function currentYear(): number {
  return new Date().getFullYear();
}

function yearOptions(): number[] {
  const y = currentYear();
  return [y - 2, y - 1, y, y + 1];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

interface RequestLeaveModalProps {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}

function RequestLeaveModal({ userId, onClose, onCreated }: RequestLeaveModalProps) {
  const [policyId, setPolicyId] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(todayIso());
  const [halfDay, setHalfDay] = useState(false);
  const [reason, setReason] = useState('');

  const policiesQ = useQuery({
    queryKey: ['leave-policies-active'],
    queryFn: () => listLeavePolicies(true),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createLeaveRequest({
        user_id: userId,
        policy_id: policyId,
        start_date: startDate,
        end_date: endDate,
        half_day: halfDay,
        reason: reason.trim() || null,
      }),
    onSuccess: () => {
      showToast.success('Leave request submitted');
      onCreated();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to submit request';
      showToast.error(msg);
    },
  });

  const canSubmit =
    policyId !== '' &&
    startDate !== '' &&
    endDate !== '' &&
    endDate >= startDate &&
    !createMut.isPending;

  return (
    <AppModal
      isOpen
      onClose={onClose}
      title="Request leave"
      description="Submit a leave request for approval."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={createMut.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!canSubmit}
            data-testid="attendance-button-submit-leave"
          >
            {createMut.isPending ? 'Submitting…' : 'Submit'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Policy
          </label>
          <select
            className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-sm"
            value={policyId}
            onChange={(e) => setPolicyId(e.target.value)}
            data-testid="attendance-select-policy"
          >
            <option value="">Select a policy…</option>
            {(policiesQ.data ?? []).map((p: LeavePolicyDTO) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Start date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              End date
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={halfDay}
            onChange={(e) => setHalfDay(e.target.checked)}
          />
          Half-day
        </label>
        <div>
          <label className="text-xs uppercase tracking-wide text-muted-foreground">
            Reason (optional)
          </label>
          <textarea
            className="mt-1 w-full rounded border border-border bg-background px-2 py-2 text-sm"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </div>
    </AppModal>
  );
}

export function MeLeavePage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [year, setYear] = useState(currentYear());
  const [showRequest, setShowRequest] = useState(false);

  const meQ = useQuery({
    queryKey: ['me-leave', year],
    queryFn: () => getMeLeave({ year }),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => {
      showToast.success('Request cancelled');
      qc.invalidateQueries({ queryKey: ['me-leave'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to cancel';
      showToast.error(msg);
    },
  });

  const data = meQ.data;
  const upcoming = data?.upcoming ?? [];
  const requests = data?.requests ?? [];

  const balanceColumns = useMemo<Column<LeaveBalanceDTO>[]>(
    () => [
      {
        key: 'policy',
        header: 'Policy',
        render: (b) => (
          <span className="flex items-center gap-2">
            {b.policy_color ? (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: b.policy_color }}
              />
            ) : null}
            <span className="font-medium text-foreground">{b.policy_name}</span>
            <span className="text-xs text-muted-foreground">{b.policy_code}</span>
          </span>
        ),
      },
      {
        key: 'entitled',
        header: 'Entitled',
        render: (b) => <span className="tabular-nums">{b.entitled_days.toFixed(1)}</span>,
      },
      {
        key: 'carried',
        header: 'Carried',
        render: (b) => <span className="tabular-nums">{b.carried_over.toFixed(1)}</span>,
      },
      {
        key: 'used',
        header: 'Used',
        render: (b) => (
          <span className="tabular-nums text-amber-400">{b.used_days.toFixed(1)}</span>
        ),
      },
      {
        key: 'pending',
        header: 'Pending',
        render: (b) => (
          <span className="tabular-nums text-blue-400">{b.pending_days.toFixed(1)}</span>
        ),
      },
      {
        key: 'remaining',
        header: 'Remaining',
        render: (b) => (
          <span className="tabular-nums font-semibold text-emerald-400">
            {b.remaining_days.toFixed(1)}
          </span>
        ),
      },
    ],
    [],
  );

  const requestColumns = useMemo<Column<LeaveRequestDTO>[]>(
    () => [
      {
        key: 'policy',
        header: 'Policy',
        render: (r) => (
          <span className="flex items-center gap-2">
            {r.policy_color ? (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: r.policy_color }}
              />
            ) : null}
            <span>{r.policy_name || r.policy_code}</span>
          </span>
        ),
      },
      {
        key: 'dates',
        header: 'Dates',
        render: (r) => (
          <span className="text-sm">
            {formatDate(r.start_date)}
            {r.start_date !== r.end_date ? ` → ${formatDate(r.end_date)}` : ''}
          </span>
        ),
      },
      {
        key: 'days',
        header: 'Days',
        render: (r) => (
          <span className="tabular-nums">
            {r.days.toFixed(1)}
            {r.half_day ? ' (½)' : ''}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => <StatusBadge status={r.status} />,
      },
      {
        key: 'reason',
        header: 'Reason',
        render: (r) => (
          <span className="text-xs text-muted-foreground">{r.reason || '—'}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: (r) =>
          r.status === 'pending' || r.status === 'approved' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => cancelMut.mutate(r.id)}
              disabled={cancelMut.isPending}
              data-testid="attendance-button-cancel-leave"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          ) : null,
      },
    ],
    [cancelMut],
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-4 p-6">
      <PageHeader
        title="My leave"
        description="Your leave balance, upcoming time off, and the status of your requests."
        actions={
          <Button
            onClick={() => setShowRequest(true)}
            disabled={!user}
            data-testid="attendance-button-request-leave"
          >
            <Plus className="h-4 w-4" />
            Request leave
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Year
          </label>
          <select
            className="mt-1 rounded border border-border bg-background px-2 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            data-testid="attendance-select-year"
          >
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {data ? (
        <section
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
          data-testid="attendance-summary-leave"
        >
          <StatTile label="Entitled" value={data.summary.entitled_days.toFixed(1)} />
          <StatTile label="Carried" value={data.summary.carried_over.toFixed(1)} />
          <StatTile
            label="Used"
            value={data.summary.used_days.toFixed(1)}
            tone="text-amber-400"
          />
          <StatTile
            label="Pending"
            value={data.summary.pending_days.toFixed(1)}
            tone="text-blue-400"
          />
          <StatTile
            label="Remaining"
            value={data.summary.remaining_days.toFixed(1)}
            tone="text-emerald-400"
          />
          <StatTile label="Upcoming" value={data.summary.upcoming_count} />
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-semibold">Balances · {year}</h2>
        </header>
        <DataTable
          data={data?.balances ?? []}
          columns={balanceColumns}
          loading={meQ.isLoading}
          emptyMessage="No leave policies yet."
          rowKey={(b) => b.id}
          paginate={false}
          embedded
          data-testid="attendance-table-me-balances"
        />
      </section>

      {upcoming.length > 0 ? (
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <h2 className="text-sm font-semibold">Upcoming</h2>
          </header>
          <DataTable
            data={upcoming}
            columns={requestColumns}
            emptyMessage="No upcoming leave."
            rowKey={(r) => r.id}
            paginate={false}
            embedded
            data-testid="attendance-table-me-upcoming"
          />
        </section>
      ) : null}

      <section className="flex-1 rounded-lg border border-border bg-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 className="text-sm font-semibold">Requests · {year}</h2>
        </header>
        <DataTable
          data={requests}
          columns={requestColumns}
          loading={meQ.isLoading}
          emptyMessage="No leave requests this year."
          rowKey={(r) => r.id}
          paginate={false}
          embedded
          data-testid="attendance-table-me-requests"
        />
      </section>

      {showRequest && user ? (
        <RequestLeaveModal
          userId={user.id}
          onClose={() => setShowRequest(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['me-leave'] })}
        />
      ) : null}
    </div>
  );
}
