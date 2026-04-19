import { useEffect, useMemo, useState } from 'react';
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
import { Wallet, PencilLine, Search, X } from 'lucide-react';
import {
  apiFetch,
  listLeaveBalances,
  adjustLeaveBalance,
  type LeaveBalanceDTO,
} from '@dm3/api-client';

// AttendanceLeaveBalancePage — admin view of a chosen user's leave balances for
// a given year. Lists one row per policy (the backend lazily seeds rows on
// first query so every active policy is visible). The adjustment modal lets
// HR bump `entitled_days` or `carried_over`; `used_days` / `pending_days` are
// derived from leave_requests and not directly editable here.

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

function currentYear(): number {
  return new Date().getFullYear();
}

function yearOptions(): number[] {
  const y = currentYear();
  return [y - 2, y - 1, y, y + 1];
}

export function AttendanceLeaveBalancePage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserLite | null>(null);
  const [year, setYear] = useState(currentYear());
  const [editing, setEditing] = useState<LeaveBalanceDTO | null>(null);

  // Debounce the search input so we don't hammer /users on every keystroke.
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 200);
    return () => clearTimeout(id);
  }, [search]);

  const userQ = useQuery({
    queryKey: ['attendance-user-search', debounced],
    enabled: debounced.trim().length >= 2 && !selectedUser,
    queryFn: async () => {
      const params = new URLSearchParams({ search: debounced.trim(), limit: '10', page: '1' });
      const data = await apiFetch<{ users: UserLite[] }>(
        `/api/v1/identity/users?${params.toString()}`,
      );
      return data.users ?? [];
    },
  });

  const balancesQ = useQuery({
    queryKey: ['leave-balances', selectedUser?.id, year],
    enabled: Boolean(selectedUser?.id),
    queryFn: () => listLeaveBalances({ user_id: selectedUser!.id, year }),
  });

  const balances = balancesQ.data?.items ?? [];

  const totals = useMemo(() => {
    const acc = { entitled: 0, used: 0, pending: 0, carried: 0, remaining: 0 };
    balances.forEach((b) => {
      acc.entitled += b.entitled_days;
      acc.used += b.used_days;
      acc.pending += b.pending_days;
      acc.carried += b.carried_over;
      acc.remaining += b.remaining_days;
    });
    return acc;
  }, [balances]);

  const columns = useMemo<Column<LeaveBalanceDTO>[]>(
    () => [
      {
        key: 'policy',
        header: 'Policy',
        render: (b) => (
          <div className="flex items-center gap-2">
            <span
              className="inline-block size-3 shrink-0 rounded-sm"
              style={{ background: b.policy_color || '#6B7280' }}
              aria-hidden
            />
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-foreground">
                {b.policy_name || b.policy_code || b.policy_id.slice(0, 8)}
              </div>
              {b.policy_code && (
                <div className="text-[11px] font-mono text-muted-foreground">
                  {b.policy_code}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'entitled',
        header: 'Entitled',
        width: '90px',
        render: (b) => (
          <span className="font-mono text-[12px]">{b.entitled_days.toFixed(1)}</span>
        ),
      },
      {
        key: 'carried',
        header: 'Carried',
        width: '90px',
        render: (b) => (
          <span className="font-mono text-[12px] text-muted-foreground">
            {b.carried_over.toFixed(1)}
          </span>
        ),
      },
      {
        key: 'used',
        header: 'Used',
        width: '80px',
        render: (b) => (
          <span className="font-mono text-[12px] text-red-400">
            {b.used_days.toFixed(1)}
          </span>
        ),
      },
      {
        key: 'pending',
        header: 'Pending',
        width: '90px',
        render: (b) => (
          <span className="font-mono text-[12px] text-amber-400">
            {b.pending_days.toFixed(1)}
          </span>
        ),
      },
      {
        key: 'remaining',
        header: 'Remaining',
        width: '100px',
        render: (b) => (
          <span className="font-mono text-[13px] font-semibold text-emerald-400">
            {b.remaining_days.toFixed(1)}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '110px',
        render: (b) => (
          <div className="flex justify-end">
            <Button
              size="xs"
              variant="outline"
              onClick={() => setEditing(b)}
              data-testid={`attendance-button-adjust-balance-${b.policy_code ?? b.policy_id}`}
            >
              <PencilLine size={12} className="mr-1" /> Adjust
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Leave balances"
        description="Review and adjust per-user entitlements. Used and pending days come from leave requests."
      >
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-select-balance-year"
        >
          {yearOptions().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </PageHeader>

      <div className="mb-4 rounded-md border border-border bg-card p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
          Employee
        </div>
        {selectedUser ? (
          <div className="flex items-center justify-between gap-3">
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-foreground">
                {fullName(selectedUser)}
              </div>
              {selectedUser.email && (
                <div className="text-[11px] text-muted-foreground">
                  {selectedUser.email}
                </div>
              )}
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setSelectedUser(null);
                setSearch('');
              }}
              data-testid="attendance-button-clear-user"
            >
              <X size={12} className="mr-1" />
              Change
            </Button>
          </div>
        ) : (
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employee by name, email, or code…"
              className="h-8 pl-7 text-[13px]"
              data-testid="attendance-input-search-user"
            />
            {debounced.trim().length >= 2 && (
              <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-popover">
                {userQ.isLoading ? (
                  <div className="p-2 text-[12px] text-muted-foreground">
                    Searching…
                  </div>
                ) : (userQ.data ?? []).length === 0 ? (
                  <div className="p-2 text-[12px] text-muted-foreground">
                    No users match "{debounced}".
                  </div>
                ) : (
                  (userQ.data ?? []).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUser(u)}
                      className="flex w-full items-center justify-between gap-3 border-b border-border px-2 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-accent"
                      data-testid={`attendance-option-user-${u.id}`}
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
        )}
      </div>

      {selectedUser && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <SummaryCell label="Entitled" value={totals.entitled} tone="foreground" />
            <SummaryCell label="Carried" value={totals.carried} tone="muted" />
            <SummaryCell label="Used" value={totals.used} tone="red" />
            <SummaryCell label="Pending" value={totals.pending} tone="amber" />
            <SummaryCell label="Remaining" value={totals.remaining} tone="emerald" />
          </div>

          {balancesQ.isLoading ? (
            <div className="py-12 text-center text-muted-foreground">
              Loading balances…
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={balances}
              rowKey={(b) => b.id || `${b.policy_id}-${b.year}`}
              emptyIcon={<Wallet size={32} strokeWidth={1.2} />}
              emptyTitle="No leave policies are active"
              emptyDescription="Create a leave policy first; balance rows are seeded automatically."
            />
          )}
        </>
      )}

      {editing && selectedUser && (
        <AdjustBalanceModal
          balance={editing}
          userId={selectedUser.id}
          userLabel={fullName(selectedUser)}
          year={year}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['leave-balances'] });
          }}
        />
      )}
    </div>
  );
}

interface SummaryCellProps {
  label: string;
  value: number;
  tone: 'emerald' | 'amber' | 'red' | 'muted' | 'foreground';
}

const TONE_CLASSES: Record<SummaryCellProps['tone'], string> = {
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground',
  foreground: 'text-foreground',
};

function SummaryCell({ label, value, tone }: SummaryCellProps) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${TONE_CLASSES[tone]}`}>
        {value.toFixed(1)}
      </div>
    </div>
  );
}

interface AdjustBalanceModalProps {
  balance: LeaveBalanceDTO;
  userId: string;
  userLabel: string;
  year: number;
  onClose: () => void;
  onSaved: () => void;
}

function AdjustBalanceModal({
  balance,
  userId,
  userLabel,
  year,
  onClose,
  onSaved,
}: AdjustBalanceModalProps) {
  const [entitled, setEntitled] = useState(String(balance.entitled_days));
  const [carried, setCarried] = useState(String(balance.carried_over));

  const m = useMutation({
    mutationFn: () => {
      const body: Parameters<typeof adjustLeaveBalance>[0] = {
        user_id: userId,
        policy_id: balance.policy_id,
        year,
      };
      const entitledNum = Number(entitled);
      const carriedNum = Number(carried);
      if (!Number.isNaN(entitledNum) && entitledNum !== balance.entitled_days) {
        body.entitled_days = entitledNum;
      }
      if (!Number.isNaN(carriedNum) && carriedNum !== balance.carried_over) {
        body.carried_over = carriedNum;
      }
      return adjustLeaveBalance(body);
    },
    onSuccess: () => {
      showToast({ type: 'success', title: 'Balance updated' });
      onSaved();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to update balance';
      showToast({ type: 'error', title: 'Update failed', description: msg });
    },
  });

  const entitledNum = Number(entitled);
  const carriedNum = Number(carried);
  const canSubmit =
    !m.isPending &&
    !Number.isNaN(entitledNum) &&
    entitledNum >= 0 &&
    !Number.isNaN(carriedNum) &&
    carriedNum >= 0 &&
    (entitledNum !== balance.entitled_days || carriedNum !== balance.carried_over);

  const policyLabel = balance.policy_name || balance.policy_code || 'policy';

  return (
    <AppModal
      open
      onClose={onClose}
      title={`Adjust ${policyLabel}`}
      description={`${userLabel} · ${year}. Used and pending days are derived from leave requests and cannot be edited here.`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="attendance-button-adjust-balance-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!canSubmit}
            data-testid="attendance-button-adjust-balance-save"
          >
            {m.isPending ? 'Saving…' : 'Save adjustment'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Entitled days">
          <Input
            type="number"
            step="0.5"
            min="0"
            value={entitled}
            onChange={(e) => setEntitled(e.target.value)}
            data-testid="attendance-input-adjust-entitled"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Total quota granted for {year}. Was {balance.entitled_days.toFixed(1)}.
          </p>
        </Field>
        <Field label="Carried over">
          <Input
            type="number"
            step="0.5"
            min="0"
            value={carried}
            onChange={(e) => setCarried(e.target.value)}
            data-testid="attendance-input-adjust-carried"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Days rolled forward from the prior year. Was {balance.carried_over.toFixed(1)}.
          </p>
        </Field>
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          <div>
            Used: <span className="font-mono">{balance.used_days.toFixed(1)}</span>
          </div>
          <div>
            Pending: <span className="font-mono">{balance.pending_days.toFixed(1)}</span>
          </div>
          <div>
            Remaining after save:{' '}
            <span className="font-mono text-emerald-400">
              {Math.max(
                0,
                (Number.isNaN(entitledNum) ? balance.entitled_days : entitledNum) +
                  (Number.isNaN(carriedNum) ? balance.carried_over : carriedNum) -
                  balance.used_days -
                  balance.pending_days,
              ).toFixed(1)}
            </span>
          </div>
        </div>
      </div>
    </AppModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
