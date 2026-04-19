import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  AppModal,
  showToast,
  type Column,
} from '@dm3/ui';
import { Timer, Check, X, Plus } from 'lucide-react';
import {
  listOvertime,
  approveOvertime,
  rejectOvertime,
  requestOvertime,
  type OvertimeEntryDTO,
  type OvertimeStatus,
} from '@dm3/api-client';

// OvertimePage — manager review queue for attendance records that accrued
// overtime hours. Pending rows can be approved or rejected; reviewed rows are
// read-only. Status is derived server-side from (overtime_approved,
// overtime_approved_by) since the schema does not store an explicit status.

const STATUS_STYLE: Record<OvertimeStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function formatTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function OvertimePage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<OvertimeStatus | 'all'>('pending');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [requestOpen, setRequestOpen] = useState(false);

  const listQ = useQuery({
    queryKey: ['overtime', statusFilter, from, to, search, page],
    queryFn: () =>
      listOvertime({
        status: statusFilter,
        from: from || undefined,
        to: to || undefined,
        search: search || undefined,
        page,
        limit: 25,
      }),
  });

  const approveM = useMutation({
    mutationFn: (id: string) => approveOvertime(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overtime'] }),
  });
  const rejectM = useMutation({
    mutationFn: (id: string) => rejectOvertime(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overtime'] }),
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;

  const columns = useMemo<Column<OvertimeEntryDTO>[]>(
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
        key: 'date',
        header: 'Date',
        width: '120px',
        render: (r) => (
          <div className="text-[12px] font-mono">{formatDate(r.date)}</div>
        ),
      },
      {
        key: 'shift',
        header: 'Shift',
        width: '140px',
        render: (r) => (
          <span className="text-[12px] text-muted-foreground">
            {r.shift_name || '—'}
          </span>
        ),
      },
      {
        key: 'window',
        header: 'Clock in → out',
        width: '160px',
        render: (r) => (
          <div className="text-[12px] font-mono">
            {formatTime(r.clock_in)} → {formatTime(r.clock_out)}
          </div>
        ),
      },
      {
        key: 'hours',
        header: 'OT hours',
        width: '100px',
        render: (r) => (
          <span className="text-[13px] font-semibold text-amber-300">
            {r.overtime_hours.toFixed(2)}
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '100px',
        render: (r) => (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${
              STATUS_STYLE[r.status]
            }`}
          >
            {r.status}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '160px',
        render: (r) => {
          if (r.status === 'pending') {
            return (
              <div className="flex justify-end gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => approveM.mutate(r.record_id)}
                  data-testid={`attendance-button-approve-ot-${r.record_id}`}
                >
                  <Check size={12} className="mr-1" /> Approve
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => rejectM.mutate(r.record_id)}
                  data-testid={`attendance-button-reject-ot-${r.record_id}`}
                >
                  <X size={12} />
                </Button>
              </div>
            );
          }
          return null;
        },
      },
    ],
    [approveM, rejectM],
  );

  return (
    <div>
      <PageHeader
        title="Overtime review"
        description="Approve or reject overtime hours accrued by attendance records."
      >
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as OvertimeStatus | 'all');
            setPage(1);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-select-ot-status"
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <Input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className="h-8 w-36 text-[13px]"
          data-testid="attendance-input-ot-from"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className="h-8 w-36 text-[13px]"
          data-testid="attendance-input-ot-to"
        />
        <Input
          type="search"
          placeholder="Search user…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-8 w-56 text-[13px]"
          data-testid="attendance-input-ot-search"
        />
        <Button
          size="sm"
          onClick={() => setRequestOpen(true)}
          data-testid="attendance-button-request-ot"
        >
          <Plus size={14} className="mr-1" />
          Request OT
        </Button>
      </PageHeader>

      <RequestOvertimeModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        onSubmitted={() => {
          setRequestOpen(false);
          qc.invalidateQueries({ queryKey: ['overtime'] });
          setStatusFilter('pending');
          setPage(1);
        }}
      />

      {listQ.isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading overtime records…
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.record_id}
          pageSize={25}
          emptyIcon={<Timer size={32} strokeWidth={1.2} />}
          emptyTitle={
            statusFilter === 'pending'
              ? 'No overtime awaiting review'
              : 'No overtime records'
          }
          emptyDescription="Overtime appears when users stay past their shift end."
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
            >
              Prev
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={page >= Math.ceil(total / 25)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RequestOvertimeModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function RequestOvertimeModal({ open, onClose, onSubmitted }: RequestOvertimeModalProps) {
  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState('1');
  const [reason, setReason] = useState('');

  const m = useMutation({
    mutationFn: () =>
      requestOvertime({
        date,
        hours: Number(hours),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      showToast({ type: 'success', title: 'Overtime request submitted' });
      setHours('1');
      setReason('');
      setDate(todayIso());
      onSubmitted();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to submit request';
      showToast({ type: 'error', title: 'Request failed', description: msg });
    },
  });

  const hoursNum = Number(hours);
  const canSubmit =
    reason.trim().length > 0 &&
    !Number.isNaN(hoursNum) &&
    hoursNum > 0 &&
    hoursNum <= 24 &&
    !m.isPending;

  return (
    <AppModal
      open={open}
      onClose={onClose}
      title="Request overtime"
      description="Ask a manager to approve overtime hours you worked or plan to work."
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} data-testid="attendance-button-request-ot-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!canSubmit}
            data-testid="attendance-button-request-ot-submit"
          >
            {m.isPending ? 'Submitting…' : 'Submit request'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Date">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayIso()}
            data-testid="attendance-input-request-ot-date"
          />
        </Field>
        <Field label="Overtime hours">
          <Input
            type="number"
            step="0.25"
            min="0"
            max="24"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            data-testid="attendance-input-request-ot-hours"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Enter the number of overtime hours (max 24, quarter-hour increments).
          </p>
        </Field>
        <Field label="Reason" required>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why the overtime was needed"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:border-[#3B82F6]"
            data-testid="attendance-input-request-ot-reason"
          />
        </Field>
      </div>
    </AppModal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-400">*</span>}
      </span>
      {children}
    </label>
  );
}
