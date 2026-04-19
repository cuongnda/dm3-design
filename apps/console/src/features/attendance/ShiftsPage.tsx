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
import { Clock, Plus, Pencil, Archive } from 'lucide-react';
import {
  listShifts,
  createShift,
  updateShift,
  archiveShift,
  type ShiftDTO,
  type ShiftInput,
} from '@dm3/api-client';

// ShiftsPage — CRUD for attendance shifts. Soft-deletes via archive so that
// existing attendance_records and shift_assignments keep their FK references.

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function defaultFormState(): ShiftInput {
  return {
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    grace_period_minutes: 15,
    early_leave_threshold: 15,
    overtime_threshold_minutes: 30,
    max_overtime_hours: 4,
    break_deducted: true,
    working_days: [1, 2, 3, 4, 5],
    color: '#3B82F6',
    is_default: false,
  };
}

export function ShiftsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftDTO | null>(null);
  const [form, setForm] = useState<ShiftInput>(defaultFormState());
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['attendance-shifts', statusFilter, search],
    queryFn: () =>
      listShifts({
        status: statusFilter,
        search: search || undefined,
        limit: 100,
      }),
  });

  const createM = useMutation({
    mutationFn: (input: ShiftInput) => createShift(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-shifts'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateM = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ShiftInput> }) =>
      updateShift(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-shifts'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const archiveM = useMutation({
    mutationFn: (id: string) => archiveShift(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['attendance-shifts'] }),
  });

  const shifts = listQ.data?.data ?? [];

  const openCreate = () => {
    setEditing(null);
    setForm(defaultFormState());
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (s: ShiftDTO) => {
    setEditing(s);
    setForm({
      name: s.name,
      code: s.code ?? null,
      site_id: s.site_id ?? null,
      start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5),
      grace_period_minutes: s.grace_period_minutes,
      early_leave_threshold: s.early_leave_threshold,
      break_start: s.break_start?.slice(0, 5) ?? null,
      break_end: s.break_end?.slice(0, 5) ?? null,
      break_deducted: s.break_deducted,
      overtime_threshold_minutes: s.overtime_threshold_minutes,
      max_overtime_hours: s.max_overtime_hours,
      working_days: s.working_days,
      color: s.color,
      is_default: s.is_default,
      status: s.status,
    });
    setError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (editing) {
      updateM.mutate({ id: editing.id, input: form });
    } else {
      createM.mutate(form);
    }
  };

  const toggleDay = (day: number) => {
    const next = new Set(form.working_days ?? []);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    setForm({ ...form, working_days: Array.from(next).sort() });
  };

  const columns = useMemo<Column<ShiftDTO>[]>(
    () => [
      {
        key: 'name',
        header: 'Shift',
        render: (s) => (
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: s.color }}
            />
            <div>
              <div className="text-[13px] font-medium text-foreground">
                {s.name}
                {s.is_default && (
                  <span className="ml-2 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">
                    default
                  </span>
                )}
              </div>
              {s.code && (
                <div className="font-mono text-[11px] text-muted-foreground">
                  {s.code}
                </div>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'time',
        header: 'Hours',
        width: '140px',
        render: (s) => (
          <span className="font-mono text-[12px]">
            {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
          </span>
        ),
      },
      {
        key: 'working_days',
        header: 'Days',
        width: '200px',
        render: (s) => (
          <div className="flex gap-0.5">
            {DAY_LABELS.map((label, i) => {
              const day = i + 1;
              const on = s.working_days?.includes(day);
              return (
                <span
                  key={day}
                  className={`inline-flex h-5 w-7 items-center justify-center rounded text-[10px] ${
                    on
                      ? 'bg-teal-500/30 text-teal-200'
                      : 'bg-muted/20 text-muted-foreground'
                  }`}
                >
                  {label[0]}
                </span>
              );
            })}
          </div>
        ),
      },
      {
        key: 'grace',
        header: 'Grace',
        width: '80px',
        render: (s) => (
          <span className="text-[12px] text-muted-foreground">
            {s.grace_period_minutes}m
          </span>
        ),
      },
      {
        key: 'status',
        header: 'Status',
        width: '100px',
        render: (s) => (
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] capitalize ${
              s.status === 'active'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {s.status}
          </span>
        ),
      },
      {
        key: 'actions',
        header: '',
        width: '120px',
        render: (s) => (
          <div className="flex justify-end gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => openEdit(s)}
              data-testid={`attendance-button-edit-shift-${s.id}`}
            >
              <Pencil size={13} />
            </Button>
            {s.status === 'active' && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  if (confirm(`Archive shift "${s.name}"?`)) {
                    archiveM.mutate(s.id);
                  }
                }}
                data-testid={`attendance-button-archive-shift-${s.id}`}
              >
                <Archive size={13} />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [archiveM],
  );

  return (
    <div>
      <PageHeader title="Shifts" description="Define working hours, grace periods, and working days.">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as 'active' | 'archived' | 'all')
          }
          className="h-8 rounded-md border border-border bg-background px-2 text-[13px]"
          data-testid="attendance-select-shift-status"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <Input
          type="search"
          placeholder="Search shifts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56 text-[13px]"
          data-testid="attendance-input-shift-search"
        />
        <Button
          size="sm"
          onClick={openCreate}
          data-testid="attendance-button-new-shift"
        >
          <Plus size={14} className="mr-1" />
          New shift
        </Button>
      </PageHeader>

      {listQ.isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Loading shifts…
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={shifts}
          rowKey={(s) => s.id}
          pageSize={50}
          emptyIcon={<Clock size={32} strokeWidth={1.2} />}
          emptyTitle="No shifts yet"
          emptyDescription="Create a shift to start assigning users."
          emptyAction={{
            label: 'New shift',
            onClick: openCreate,
            'data-testid': 'attendance-button-empty-new-shift',
          }}
        />
      )}

      <AppModal
        open={modalOpen}
        onOpenChange={(v) => (v ? setModalOpen(v) : closeModal())}
        title={editing ? `Edit ${editing.name}` : 'New shift'}
        description="All users assigned to this shift use these hours and rules."
        size="2xl"
        errorMessage={error}
        showCancelButton
        primaryAction={{
          label: editing ? 'Save changes' : 'Create shift',
          onClick: submit,
          loading: createM.isPending || updateM.isPending,
          'data-testid': 'attendance-button-save-shift',
        }}
      >
        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <Field label="Name">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="attendance-input-shift-name"
            />
          </Field>
          <Field label="Code">
            <Input
              value={form.code ?? ''}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. DAY-A"
              data-testid="attendance-input-shift-code"
            />
          </Field>
          <Field label="Start time">
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              data-testid="attendance-input-shift-start"
            />
          </Field>
          <Field label="End time">
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              data-testid="attendance-input-shift-end"
            />
          </Field>
          <Field label="Grace (minutes)">
            <Input
              type="number"
              min={0}
              value={form.grace_period_minutes ?? 0}
              onChange={(e) =>
                setForm({ ...form, grace_period_minutes: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Early leave threshold (minutes)">
            <Input
              type="number"
              min={0}
              value={form.early_leave_threshold ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  early_leave_threshold: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Overtime threshold (minutes)">
            <Input
              type="number"
              min={0}
              value={form.overtime_threshold_minutes ?? 0}
              onChange={(e) =>
                setForm({
                  ...form,
                  overtime_threshold_minutes: Number(e.target.value),
                })
              }
            />
          </Field>
          <Field label="Max overtime (hours)">
            <Input
              type="number"
              min={0}
              step="0.5"
              value={form.max_overtime_hours ?? 0}
              onChange={(e) =>
                setForm({ ...form, max_overtime_hours: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Color">
            <input
              type="color"
              value={form.color ?? '#3B82F6'}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-full rounded border border-border bg-background"
            />
          </Field>
          <Field label="Default shift">
            <label className="flex h-9 items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_default ?? false}
                onChange={(e) =>
                  setForm({ ...form, is_default: e.target.checked })
                }
              />
              <span className="text-muted-foreground">
                Use for users without an assignment
              </span>
            </label>
          </Field>
          <div className="col-span-2">
            <Field label="Working days">
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, i) => {
                  const day = i + 1;
                  const on = (form.working_days ?? []).includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`h-8 w-12 rounded border text-[12px] ${
                        on
                          ? 'border-teal-400 bg-teal-500/20 text-teal-200'
                          : 'border-border bg-background text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </div>
      </AppModal>
    </div>
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
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
