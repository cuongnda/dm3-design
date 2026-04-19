import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  AppModal,
  type Column,
} from '@dm3/ui';
import { Plane, Check, X, Ban, Plus, Search } from 'lucide-react';
import {
  apiFetch,
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

interface UserLite {
  id: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  employee_code?: string;
}

function fullName(u: UserLite): string {
  return (
    u.full_name ||
    [u.first_name, u.last_name].filter(Boolean).join(' ').trim() ||
    u.email ||
    u.id.slice(0, 8)
  );
}

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
  const [selectedUser, setSelectedUser] = useState<UserLite | null>(null);

  // Reject review modal state: which row is being rejected, with an optional note.
  const [rejectTarget, setRejectTarget] = useState<LeaveRequestDTO | null>(null);
  const [rejectNote, setRejectNote] = useState('');

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      setRejectTarget(null);
      setRejectNote('');
    },
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
      setSelectedUser(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;

  const submit = () => {
    setError(null);
    if (!form.user_id.trim()) {
      setError('User is required');
      return;
    }
    if (!form.policy_id.trim()) {
      setError('Policy is required');
      return;
    }
    createM.mutate(form);
  };

  const confirmReject = () => {
    if (!rejectTarget) return;
    const note = rejectNote.trim();
    rejectM.mutate({ id: rejectTarget.id, note: note || undefined });
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
                    setRejectNote('');
                    setRejectTarget(r);
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
    [approveM, cancelM],
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
            setSelectedUser(null);
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
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setSelectedUser(null);
            setError(null);
          }
        }}
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
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              User
            </span>
            <UserPickerField
              selected={selectedUser}
              onSelect={(u) => {
                setSelectedUser(u);
                setForm({ ...form, user_id: u.id });
              }}
              onClear={() => {
                setSelectedUser(null);
                setForm({ ...form, user_id: '' });
              }}
            />
          </div>
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

      <AppModal
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectNote('');
          }
        }}
        title="Reject leave request"
        description={
          rejectTarget
            ? `${rejectTarget.user_name || rejectTarget.user_id.slice(0, 8)} · ${formatDate(rejectTarget.start_date)} → ${formatDate(rejectTarget.end_date)}`
            : undefined
        }
        size="md"
        showCancelButton
        primaryAction={{
          label: 'Reject request',
          onClick: confirmReject,
          loading: rejectM.isPending,
          variant: 'destructive',
          'data-testid': 'attendance-button-confirm-reject-leave',
        }}
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Reason (optional)
          </span>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            rows={4}
            placeholder="Share context the requester should see…"
            className="rounded-md border border-border bg-background px-2 py-1 text-[13px]"
            data-testid="attendance-input-reject-leave-note"
          />
          <span className="text-[11px] text-muted-foreground">
            The note is stored on the request and shown to the employee.
          </span>
        </label>
      </AppModal>
    </div>
  );
}

interface UserPickerFieldProps {
  selected: UserLite | null;
  onSelect: (u: UserLite) => void;
  onClear: () => void;
}

// UserPickerField — debounced typeahead over /api/v1/identity/users. Same
// pattern as AttendanceLeaveBalancePage so feel/behaviour stays consistent
// between the two admin screens.
function UserPickerField({ selected, onSelect, onClear }: UserPickerFieldProps) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(id);
  }, [query]);

  const userQ = useQuery({
    queryKey: ['leave-user-search', debounced],
    enabled: debounced.trim().length >= 2 && !selected,
    queryFn: async () => {
      const params = new URLSearchParams({
        search: debounced.trim(),
        limit: '10',
        page: '1',
      });
      const data = await apiFetch<{ users: UserLite[] }>(
        `/api/v1/identity/users?${params.toString()}`,
      );
      return data.users ?? [];
    },
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
        <div className="leading-tight">
          <div className="text-[13px] font-medium text-foreground">
            {fullName(selected)}
          </div>
          {selected.email && (
            <div className="text-[11px] text-muted-foreground">
              {selected.email}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            onClear();
            setQuery('');
          }}
          data-testid="attendance-button-clear-leave-user"
        >
          <X size={12} className="mr-1" />
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search employee by name, email, or code…"
        className="h-9 pl-7 text-[13px]"
        data-testid="attendance-input-leave-user"
      />
      {debounced.trim().length >= 2 && (
        <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-popover">
          {userQ.isLoading ? (
            <div className="p-2 text-[12px] text-muted-foreground">Searching…</div>
          ) : (userQ.data ?? []).length === 0 ? (
            <div className="p-2 text-[12px] text-muted-foreground">
              No users match "{debounced}".
            </div>
          ) : (
            (userQ.data ?? []).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => {
                  onSelect(u);
                  setQuery('');
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-2 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-accent"
                data-testid={`attendance-option-leave-user-${u.id}`}
              >
                <span className="text-foreground">{fullName(u)}</span>
                {u.email && (
                  <span className="text-[11px] text-muted-foreground">
                    {u.email}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
