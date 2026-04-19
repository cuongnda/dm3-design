import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PageHeader,
  DataTable,
  type Column,
  Button,
  AppModal,
  Input,
  Label,
  Select,
  SelectOption,
  EmptyState,
  showToast,
} from '@dm3/ui';
import { Trash2, PauseCircle, PlayCircle, Plus, Pencil, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  listRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  listVisits,
  type RecurringTemplateDTO,
  type VisitorDTO,
  type CreateRecurringTemplateRequest,
} from '@dm3/api-client';
import { HostSelect } from '@/components/common/HostSelect';

const PURPOSES = ['meeting', 'interview', 'delivery', 'maintenance', 'tour', 'contract_signing', 'other'] as const;

const RRULE_PRESETS: { label: string; value: string }[] = [
  { label: 'Every weekday (Mon-Fri)', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { label: 'Weekly on Monday', value: 'FREQ=WEEKLY;BYDAY=MO' },
  { label: 'Monthly on the 1st', value: 'FREQ=MONTHLY;BYMONTHDAY=1' },
  { label: 'Daily', value: 'FREQ=DAILY' },
];

type FormState = {
  visitor_id: string;
  host_user_id: string;
  purpose: string;
  recurrence_rule: string;
  start_date: string;
  end_date: string;
  escort_required: boolean;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  visitor_id: '',
  host_user_id: '',
  purpose: 'meeting',
  recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
  start_date: '',
  end_date: '',
  escort_required: false,
  active: true,
};

function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function getVisitorLabel(v: VisitorDTO): string {
  const fullName = [v.first_name, v.last_name].filter(Boolean).join(' ').trim();
  return v.display_name || fullName || v.email || v.id;
}

export function VisitorRecurringPage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['visitor-recurring'],
    queryFn: () => listRecurringTemplates(),
  });
  const templates = data?.data ?? [];

  // Derive visitor pool from recent visits (no dedicated /visitors endpoint)
  const { data: visitsData } = useQuery({
    queryKey: ['visitor-recurring-visitor-pool'],
    queryFn: () => listVisits({ page: 1, limit: 200 }),
    enabled: showForm,
  });

  const visitorOptions = useMemo<VisitorDTO[]>(() => {
    const seen = new Map<string, VisitorDTO>();
    for (const visit of visitsData?.data ?? []) {
      if (visit.visitor && !seen.has(visit.visitor_id)) {
        seen.set(visit.visitor_id, visit.visitor);
      }
    }
    return Array.from(seen.values()).sort((a, b) => getVisitorLabel(a).localeCompare(getVisitorLabel(b)));
  }, [visitsData]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (t: RecurringTemplateDTO) => {
    setEditingId(t.id);
    setForm({
      visitor_id: t.visitor_id,
      host_user_id: t.host_user_id,
      purpose: t.purpose,
      recurrence_rule: t.recurrence_rule,
      start_date: t.start_date?.slice(0, 10) ?? '',
      end_date: t.end_date?.slice(0, 10) ?? '',
      escort_required: t.escort_required,
      active: t.active,
    });
    setShowForm(true);
  };

  useEffect(() => {
    if (!showForm) resetForm();
  }, [showForm]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateRecurringTemplateRequest) => createRecurringTemplate(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-recurring'] });
      setShowForm(false);
      showToast({ type: 'success', title: 'Recurring template created' });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Could not create template',
        description: getErrorMessage(err, 'Please check the form and try again.'),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateRecurringTemplateRequest & { active: boolean }> }) =>
      updateRecurringTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-recurring'] });
      setShowForm(false);
      showToast({ type: 'success', title: 'Template updated' });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Could not update template',
        description: getErrorMessage(err, 'Please check the form and try again.'),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-recurring'] });
      showToast({ type: 'success', title: 'Template deleted' });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Could not delete template',
        description: getErrorMessage(err, 'Try again in a moment.'),
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateRecurringTemplate(id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visitor-recurring'] }),
    onError: (err) => {
      showToast({
        type: 'error',
        title: 'Could not update status',
        description: getErrorMessage(err, 'Try again in a moment.'),
      });
    },
  });

  const canSubmit = Boolean(
    form.visitor_id && form.host_user_id && form.purpose && form.recurrence_rule && form.start_date
  );

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload: CreateRecurringTemplateRequest = {
      visitor_id: form.visitor_id,
      host_user_id: form.host_user_id,
      purpose: form.purpose,
      recurrence_rule: form.recurrence_rule,
      start_date: form.start_date,
      end_date: form.end_date || undefined,
      escort_required: form.escort_required,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { ...payload, active: form.active } });
    } else {
      createMutation.mutate(payload);
    }
  };

  const columns: Column<RecurringTemplateDTO>[] = [
    {
      key: 'visitor',
      header: 'Visitor',
      render: (r) => (
        <span className="font-medium">
          {r.visitor ? getVisitorLabel(r.visitor) : r.visitor_id.slice(0, 8)}
        </span>
      ),
    },
    { key: 'purpose', header: 'Purpose', render: (r) => <span className="capitalize">{r.purpose.replace(/_/g, ' ')}</span> },
    {
      key: 'recurrence_rule', header: 'Schedule',
      render: (r) => <span className="text-muted-foreground text-[12px] font-mono">{r.recurrence_rule}</span>,
    },
    {
      key: 'start_date', header: 'Period', width: '180px',
      render: (r) => (
        <span className="text-muted-foreground text-[12px]">
          {r.start_date}{r.end_date ? ` — ${r.end_date}` : ' — ongoing'}
        </span>
      ),
    },
    {
      key: 'active', header: 'Status', width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.active ? 'text-emerald-400' : 'text-muted-foreground')}>
          {r.active ? 'Active' : 'Paused'}
        </span>
      ),
    },
    {
      key: 'last_generated', header: 'Last Generated', width: '140px',
      render: (r) => (
        <span className="font-mono text-[12px] text-muted-foreground">
          {r.last_generated ? new Date(r.last_generated).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions', header: '', width: '140px',
      render: (r) => (
        <div className="flex gap-1">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => toggleMutation.mutate({ id: r.id, active: !r.active })}
            data-testid={`visitors-button-recurring-toggle-${r.id}`}
          >
            {r.active ? <PauseCircle size={14} className="text-amber-400" /> : <PlayCircle size={14} className="text-emerald-400" />}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => openEdit(r)}
            data-testid={`visitors-button-recurring-edit-${r.id}`}
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-destructive"
            onClick={() => deleteMutation.mutate(r.id)}
            data-testid={`visitors-button-recurring-delete-${r.id}`}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Recurring Visits" description="Manage recurring visit templates for regular visitors">
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="visitors-button-create-recurring"
        >
          <Plus size={16} className="mr-1" /> New Template
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<CalendarClock size={32} strokeWidth={1.2} />}
            title="No recurring templates yet"
            description="Schedule regular visitors — weekly contractors, monthly auditors, daily deliveries — so the system auto-generates visits on the cadence you define."
            primaryAction={{
              label: 'New Template',
              icon: <Plus size={14} />,
              onClick: openCreate,
              'data-testid': 'visitors-button-create-recurring-empty',
            }}
          />
        </div>
      ) : (
        <DataTable columns={columns} data={templates} rowKey={(r) => r.id} />
      )}

      <AppModal
        open={showForm}
        onOpenChange={setShowForm}
        title={editingId ? 'Edit Recurring Template' : 'New Recurring Template'}
        description="Schedule recurring visits using an RRULE pattern."
        size="md"
        showCancelButton
        primaryAction={{
          label: createMutation.isPending || updateMutation.isPending
            ? (editingId ? 'Saving…' : 'Creating…')
            : (editingId ? 'Save' : 'Create'),
          onClick: handleSubmit,
          disabled: !canSubmit || createMutation.isPending || updateMutation.isPending,
          'data-testid': 'visitors-button-recurring-submit',
        }}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">Visitor *</Label>
            <Select
              className="mt-1 h-8 text-[13px]"
              value={form.visitor_id}
              onChange={(e) => setForm((f) => ({ ...f, visitor_id: e.target.value }))}
              data-testid="visitors-select-recurring-visitor"
              disabled={!!editingId}
            >
              <SelectOption value="">Select visitor…</SelectOption>
              {/* When editing, ensure the current visitor is in the list even if not in recent visits */}
              {editingId && !visitorOptions.some((v) => v.id === form.visitor_id) && form.visitor_id && (
                <SelectOption value={form.visitor_id}>{form.visitor_id.slice(0, 8)}… (current)</SelectOption>
              )}
              {visitorOptions.map((v) => (
                <SelectOption key={v.id} value={v.id}>
                  {getVisitorLabel(v)}{v.company ? ` — ${v.company}` : ''}
                </SelectOption>
              ))}
            </Select>
            {!editingId && visitorOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                No recent visitors available. Register a walk-in or pre-register a visit first.
              </p>
            )}
          </div>

          <div>
            <Label className="text-[12px]">Host *</Label>
            <HostSelect
              value={form.host_user_id}
              onChange={(host) => setForm((f) => ({ ...f, host_user_id: host?.id ?? '' }))}
              placeholder="Select host user"
              emptyLabel="No matching hosts"
              buttonTestId="visitors-select-recurring-host"
              searchInputTestId="visitors-search-recurring-host"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Purpose *</Label>
              <Select
                className="mt-1 h-8 text-[13px]"
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                data-testid="visitors-select-recurring-purpose"
              >
                {PURPOSES.map((p) => (
                  <SelectOption key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1).replace(/_/g, ' ')}</SelectOption>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">Escort</Label>
              <Select
                className="mt-1 h-8 text-[13px]"
                value={form.escort_required ? 'yes' : 'no'}
                onChange={(e) => setForm((f) => ({ ...f, escort_required: e.target.value === 'yes' }))}
                data-testid="visitors-select-recurring-escort"
              >
                <SelectOption value="no">Not required</SelectOption>
                <SelectOption value="yes">Required</SelectOption>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[12px]">Recurrence (RRULE) *</Label>
            <Select
              className="mt-1 h-8 text-[13px]"
              value={RRULE_PRESETS.some((p) => p.value === form.recurrence_rule) ? form.recurrence_rule : ''}
              onChange={(e) => {
                if (e.target.value) setForm((f) => ({ ...f, recurrence_rule: e.target.value }));
              }}
              data-testid="visitors-select-recurring-rrule-preset"
            >
              <SelectOption value="">Custom</SelectOption>
              {RRULE_PRESETS.map((p) => (
                <SelectOption key={p.value} value={p.value}>{p.label}</SelectOption>
              ))}
            </Select>
            <Input
              className="mt-2 h-8 text-[13px] font-mono"
              value={form.recurrence_rule}
              onChange={(e) => setForm((f) => ({ ...f, recurrence_rule: e.target.value }))}
              placeholder="FREQ=WEEKLY;BYDAY=MO"
              data-testid="visitors-input-recurring-rrule"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              iCalendar RRULE format. Pick a preset above or edit directly.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">Start Date *</Label>
              <Input
                type="date"
                className="mt-1 h-8 text-[13px]"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                data-testid="visitors-input-recurring-start"
              />
            </div>
            <div>
              <Label className="text-[12px]">End Date</Label>
              <Input
                type="date"
                className="mt-1 h-8 text-[13px]"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                data-testid="visitors-input-recurring-end"
              />
            </div>
          </div>

          {editingId && (
            <div>
              <Label className="text-[12px]">Status</Label>
              <Select
                className="mt-1 h-8 text-[13px]"
                value={form.active ? 'active' : 'paused'}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'active' }))}
                data-testid="visitors-select-recurring-status"
              >
                <SelectOption value="active">Active</SelectOption>
                <SelectOption value="paused">Paused</SelectOption>
              </Select>
            </div>
          )}
        </div>
      </AppModal>
    </div>
  );
}
