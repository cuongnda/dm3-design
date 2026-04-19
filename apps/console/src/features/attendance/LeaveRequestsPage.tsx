import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  AppModal,
  type Column,
} from '@dm3/ui';
import { Plane, Check, X, Ban, Plus } from 'lucide-react';
import {
  listLeaveRequests,
  listLeavePolicies,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  type LeaveRequestDTO,
  type LeaveStatus,
  type CreateLeaveRequestInput,
} from '@dm3/api-client';

// LeaveRequestsPage — HR-facing triage list. Pending requests surface approve /
// reject actions; approved/cancelled rows are read-only. Anyone with access to
// this screen can also file a request via the "New request" modal.

const STATUS_STYLE: Record<LeaveStatus, string> = {
  pending: 'bg-amber-500/20 text-amber-400',
  approved: 'bg-emerald-500/20 text-emerald-400',
  rejected: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function LeaveRequestsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | ''>('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emptyForm = (): CreateLeaveRequestInput => ({
    user_id: '',
    policy_id: '',
    start_date: todayIso(),
    end_date: todayIso(),
    days: 1,
    half_day: false,
    reason: '',
  });
  const [form, setForm] = useState<CreateLeaveRequestInput>(emptyForm());

  const policiesQ = useQuery({
    queryKey: ['leave-policies'],
    queryFn: () => listLeavePolicies(),
  });

  const listQ = useQuery({
    queryKey: ['leave-requests', statusFilter, search, page],
    queryFn: () =>
      listLeaveRequests({
        status: statusFilter || undefined,
        search: search || undefined,
        page,
        limit: 25,
      }),
  });

  const approveM = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      approveLeaveRequest(id, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });
  const rejectM = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      rejectLeaveRequest(id, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-requests'] }),
  });
  const createM = useMutation({
    mutationFn: (input: CreateLeaveRequestInput) => createLeaveRequest(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      setCreateOpen(false);
      setForm(emptyForm());
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;

  const submit = () => {
    setError(null);
    if (!form.user_id.trim()) {
      setError('User ID is required');
      return;
    }
    if (!form.policy_id.trim()) {
      setError('Policy is required');
      return;
    }
    createM.mutate(form);
  };

  const columns = useMemo<Column<LeaveRequestDTO>[]>(
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
              <div className="text-[11px] text-muted-foreground">
                {r.user_email}
              </div>
            )}
          </div>
        ),
      },
      {
        key: 'policy',
        header: 'Policy',
        width: '160px',
        render: (r) => (
          <div className="flex items-center gap-2">
            {r.policy_color && (
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: r.policy_color }}
              />
            )}
            <span className="text-[12px]">{r.policy_name || '—'}</span>
          </div>
        ),
      },
      {
        key: 'window',
        header: 'Dates',
        width: '200px',
        render: (r) => (
          <div className="text-[12px]">
            <div className="font-mono">
              {formatDate(r.start_date)} → {formatDate(r.end_date)}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {r.days} day{r.days === 1 ? '' : 's'}
              {r.half_day && ' · half day'}
            </div>
          </div>
        ),
      },
      {
        key: 'reason',
        header: 'Reason',
        render: (r) => (
          <span className="text-[12px] text-muted-foreground line-clamp-2">
            {r.reason || '—'}
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
                  onClick={() => approveM.mutate({ id: r.id })}
                  data-testid={`attendance-button-approve-leave-${r.id}`}
                >
                  <Check size={12} className="mr-1" /> Approve
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    const note = prompt('Reason for rejection (optional):') ?? undefined;
                    rejectM.mutate({ id: r.id, note });
                  }}
                  data-testid={`attendance-button-reject-leave-${r.id}`}
                >
                  <X size={12} />
                </Button>
              </div>
            );
          }
          if (r.status === 'approved') {
            return (
              <div className="flex justify-end">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    if (confirm('Cancel this approved leave?')) cancelM.mutate(r.id);
                  }}
                  data-testid={`attendance-button-cancel-leave-${r.id}`}
                >
                  <Ban size={12} className="mr-1" /> Cancel
                </Button>
              </div>
            );
          }
          return null;
        },
      },
    ],
    [approveM, rejectM, cancelM],
  );

  return (
    <div>
      <PageHeader
        title="Leave requests"
        description="Approve, reject, or cancel time-off requests."
      >
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as LeaveStatus | '');
            setPage(1);
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-select-leave-status"
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Input
          type="search"
          placeholder="Search user…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="h-8 w-56 text-[13px]"
          data-testid="attendance-input-leave-search"
        />
        <Button
          size="sm"
          onClick={() => {
            setForm(emptyForm());
            setError(null);
            setCreateOpen(true);
          }}
          data-testid="attendance-button-new-leave"
        >
          <Plus size={14} className="mr-1" /> New request
        </Button>
      </PageHeader>

      {listQ.isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading requests…
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          pageSize={25}
          emptyIcon={<Plane size={32} strokeWidth={1.2} />}
          emptyTitle={statusFilter ? `No ${statusFilter} requests` : 'No leave requests'}
          emptyDescription="Requests will appear here when users submit time-off."
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

      <AppModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New leave request"
        size="lg"
        errorMessage={error}
        showCancelButton
        primaryAction={{
          label: 'Submit request',
          onClick: submit,
          loading: createM.isPending,
          'data-testid': 'attendance-button-save-leave',
        }}
      >
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              User ID
            </span>
            <Input
              value={form.user_id}
              onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              placeholder="uuid"
              data-testid="attendance-input-leave-user"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Policy
            </span>
            <select
              value={form.policy_id}
              onChange={(e) => setForm({ ...form, policy_id: e.target.value })}
              className="h-9 rounded-md border border-border bg-background px-2 text-[13px]"
              data-testid="attendance-select-leave-policy"
            >
              <option value="">Select a policy…</option>
              {(policiesQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Start date
            </span>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              End date
            </span>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Days
            </span>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={form.days ?? 1}
              onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.half_day ?? false}
              onChange={(e) => setForm({ ...form, half_day: e.target.checked })}
            />
            <span className="text-muted-foreground">Half day</span>
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Reason
            </span>
            <textarea
              value={form.reason ?? ''}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={3}
              className="rounded-md border border-border bg-background px-2 py-1 text-[13px]"
            />
          </label>
        </div>
      </AppModal>
    </div>
  );
}
