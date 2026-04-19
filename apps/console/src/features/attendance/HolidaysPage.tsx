import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  Button,
  Input,
  AppModal,
  type Column,
} from '@dm3/ui';
import { CalendarDays, Plus, Pencil, Trash2 } from 'lucide-react';
import {
  listHolidays,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  type HolidayDTO,
  type HolidayInput,
} from '@dm3/api-client';

// HolidaysPage — CRUD for dm3_attendance.holidays. Used by HR to configure
// public holidays + company closures; BR-004 (absence cron) skips these dates.

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - 1 + i);

function defaultForm(): HolidayInput {
  const today = new Date().toISOString().slice(0, 10);
  return { date: today, name: '', description: '', is_paid: true };
}

export function HolidaysPage() {
  const qc = useQueryClient();
  const [year, setYear] = useState(CURRENT_YEAR);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayDTO | null>(null);
  const [form, setForm] = useState<HolidayInput>(defaultForm());
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['attendance-holidays', year],
    queryFn: () => listHolidays(year),
  });

  const createM = useMutation({
    mutationFn: (body: HolidayInput) => createHoliday(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-holidays'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateM = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<HolidayInput> }) =>
      updateHoliday(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-holidays'] });
      closeModal();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteHoliday(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['attendance-holidays'] }),
    onError: (e: Error) => setError(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm(defaultForm());
    setError(null);
    setModalOpen(true);
  }

  function openEdit(h: HolidayDTO) {
    setEditing(h);
    setForm({
      date: h.date,
      name: h.name,
      description: h.description ?? '',
      is_paid: h.is_paid,
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setError(null);
  }

  function submit() {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    if (editing) {
      // Date is immutable — the backend ignores it on PATCH anyway.
      const { date: _ignored, ...rest } = form;
      updateM.mutate({ id: editing.id, body: rest });
    } else {
      createM.mutate(form);
    }
  }

  const columns = useMemo<Column<HolidayDTO>[]>(
    () => [
      {
        key: 'date',
        header: 'Date',
        accessor: (h) =>
          new Date(h.date).toLocaleDateString(undefined, {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: '2-digit',
          }),
      },
      { key: 'name', header: 'Name', accessor: (h) => h.name },
      {
        key: 'is_paid',
        header: 'Paid',
        accessor: (h) => (h.is_paid ? 'Yes' : 'No'),
      },
      {
        key: 'description',
        header: 'Description',
        accessor: (h) => h.description ?? '—',
      },
      {
        key: 'actions',
        header: '',
        accessor: (h) => (
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              data-testid={`holiday-button-edit-${h.id}`}
              onClick={() => openEdit(h)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              data-testid={`holiday-button-delete-${h.id}`}
              onClick={() => {
                if (confirm(`Delete holiday "${h.name}"?`)) deleteM.mutate(h.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ],
    [deleteM],
  );

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        icon={CalendarDays}
        title="Holiday Calendar"
        description="Public holidays and company closures. Employees on shift are not marked absent on these dates."
        actions={
          <Button
            onClick={openCreate}
            data-testid="holiday-button-create"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Holiday
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <label className="text-sm text-muted-foreground">Year</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-card border border-border rounded-md px-3 py-1.5 text-sm"
          data-testid="holiday-select-year"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={listQ.data?.items ?? []}
        loading={listQ.isLoading}
        emptyMessage="No holidays configured for this year yet."
        data-testid="holiday-table"
      />

      <AppModal
        open={modalOpen}
        onOpenChange={(o) => (o ? setModalOpen(true) : closeModal())}
        title={editing ? 'Edit Holiday' : 'Add Holiday'}
        description={
          editing
            ? 'Update name, description, or paid status. Date is immutable — delete and recreate to move a holiday.'
            : 'Add a new public holiday or company closure.'
        }
        footer={
          <>
            <Button
              variant="ghost"
              onClick={closeModal}
              data-testid="holiday-modal-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={createM.isPending || updateM.isPending}
              data-testid="holiday-modal-save"
            >
              {editing ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && (
            <div className="text-sm text-destructive" role="alert">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Date</label>
            <Input
              type="date"
              value={form.date}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              data-testid="holiday-input-date"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Tết Nguyên Đán"
              data-testid="holiday-input-name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={form.description ?? ''}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional"
              data-testid="holiday-input-description"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_paid ?? true}
              onChange={(e) => setForm({ ...form, is_paid: e.target.checked })}
              data-testid="holiday-checkbox-paid"
            />
            Paid holiday
          </label>
        </div>
      </AppModal>
    </div>
  );
}
