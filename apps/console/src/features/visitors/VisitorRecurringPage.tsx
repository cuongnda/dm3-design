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
import { useTranslation } from 'react-i18next';
import {
  listRecurringTemplates,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  listVisits,
  getVisitorSettings,
  type RecurringTemplateDTO,
  type VisitorDTO,
  type CreateRecurringTemplateRequest,
} from '@dm3/api-client';
import { HostSelect } from '@/components/common/HostSelect';

const PURPOSES = ['meeting', 'interview', 'delivery', 'maintenance', 'tour', 'contract_signing', 'other'] as const;

// Label keys are resolved via t() at render time (not at module-load) so the
// presets respond to language switches.
const RRULE_PRESETS: { labelKey: string; value: string }[] = [
  { labelKey: 'visitors.recurring.rrulePresets.weekdays', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { labelKey: 'visitors.recurring.rrulePresets.weekly', value: 'FREQ=WEEKLY;BYDAY=MO' },
  { labelKey: 'visitors.recurring.rrulePresets.monthly', value: 'FREQ=MONTHLY;BYMONTHDAY=1' },
  { labelKey: 'visitors.recurring.rrulePresets.daily', value: 'FREQ=DAILY' },
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
  const { t } = useTranslation('manage');
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ['visitor-recurring'],
    queryFn: () => listRecurringTemplates(),
  });
  const templates = data?.data ?? [];

  const { data: visitorSettings } = useQuery({
    queryKey: ['visitor-settings'],
    queryFn: () => getVisitorSettings(),
    staleTime: 5 * 60_000,
  });
  // Host is required only when the tenant has the approval workflow on.
  const hostRequired = visitorSettings?.approval_required ?? true;

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
      showToast({ type: 'success', title: t('visitors.recurring.toasts.created') });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: t('visitors.recurring.toasts.createError'),
        description: getErrorMessage(err, t('visitors.recurring.toasts.createErrorFallback')),
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateRecurringTemplateRequest & { active: boolean }> }) =>
      updateRecurringTemplate(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-recurring'] });
      setShowForm(false);
      showToast({ type: 'success', title: t('visitors.recurring.toasts.updated') });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: t('visitors.recurring.toasts.updateError'),
        description: getErrorMessage(err, t('visitors.recurring.toasts.createErrorFallback')),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurringTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visitor-recurring'] });
      showToast({ type: 'success', title: t('visitors.recurring.toasts.deleted') });
    },
    onError: (err) => {
      showToast({
        type: 'error',
        title: t('visitors.recurring.toasts.deleteError'),
        description: getErrorMessage(err, t('visitors.recurring.toasts.retryFallback')),
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
        title: t('visitors.recurring.toasts.statusError'),
        description: getErrorMessage(err, t('visitors.recurring.toasts.retryFallback')),
      });
    },
  });

  const canSubmit = Boolean(
    form.visitor_id && form.purpose && form.recurrence_rule && form.start_date
      && (!hostRequired || form.host_user_id),
  );

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload: CreateRecurringTemplateRequest = {
      visitor_id: form.visitor_id,
      host_user_id: form.host_user_id || undefined,
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
      header: t('visitors.recurring.columnVisitor'),
      render: (r) => (
        <span className="font-medium">
          {r.visitor ? getVisitorLabel(r.visitor) : r.visitor_id.slice(0, 8)}
        </span>
      ),
    },
    { key: 'purpose', header: t('visitors.recurring.columnPurpose'), render: (r) => <span className="capitalize">{r.purpose.replace(/_/g, ' ')}</span> },
    {
      key: 'recurrence_rule', header: t('visitors.recurring.columnSchedule'),
      render: (r) => <span className="text-muted-foreground text-[12px] font-mono">{r.recurrence_rule}</span>,
    },
    {
      key: 'start_date', header: t('visitors.recurring.columnPeriod'), width: '180px',
      render: (r) => (
        <span className="text-muted-foreground text-[12px]">
          {r.start_date}{r.end_date ? ` — ${r.end_date}` : t('visitors.recurring.ongoingSuffix')}
        </span>
      ),
    },
    {
      key: 'active', header: t('visitors.recurring.columnStatus'), width: '80px',
      render: (r) => (
        <span className={cn('text-[12px] font-medium', r.active ? 'text-emerald-400' : 'text-muted-foreground')}>
          {r.active ? t('visitors.recurring.activeLabel') : t('visitors.recurring.pausedLabel')}
        </span>
      ),
    },
    {
      key: 'last_generated', header: t('visitors.recurring.columnLastGenerated'), width: '140px',
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
      <PageHeader title={t('visitors.recurring.title')} description={t('visitors.recurring.description')}>
        <Button
          size="sm"
          onClick={openCreate}
          className="bg-emerald-600 hover:bg-emerald-700"
          data-testid="visitors-button-create-recurring"
        >
          <Plus size={16} className="mr-1" /> {t('visitors.recurring.newTemplate')}
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('visitors.recurring.loading')}</div>
      ) : templates.length === 0 ? (
        <div className="py-10">
          <EmptyState
            icon={<CalendarClock size={32} strokeWidth={1.2} />}
            title={t('visitors.recurring.empty.title')}
            description={t('visitors.recurring.empty.description')}
            primaryAction={{
              label: t('visitors.recurring.newTemplate'),
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
        title={editingId ? t('visitors.recurring.form.titleEdit') : t('visitors.recurring.form.titleNew')}
        description={t('visitors.recurring.form.description')}
        size="md"
        showCancelButton
        primaryAction={{
          label: createMutation.isPending || updateMutation.isPending
            ? (editingId ? t('visitors.recurring.buttons.savingLabel') : t('visitors.recurring.buttons.creatingLabel'))
            : (editingId ? t('visitors.recurring.buttons.saveLabel') : t('visitors.recurring.buttons.createLabel')),
          onClick: handleSubmit,
          disabled: !canSubmit || createMutation.isPending || updateMutation.isPending,
          'data-testid': 'visitors-button-recurring-submit',
        }}
      >
        <div className="space-y-3">
          <div>
            <Label className="text-[12px]">{t('visitors.recurring.form.visitorLabel')}</Label>
            <Select
              className="mt-1 h-8 text-[13px]"
              value={form.visitor_id}
              onChange={(e) => setForm((f) => ({ ...f, visitor_id: e.target.value }))}
              data-testid="visitors-select-recurring-visitor"
              disabled={!!editingId}
            >
              <SelectOption value="">{t('visitors.recurring.form.visitorPlaceholder')}</SelectOption>
              {/* When editing, ensure the current visitor is in the list even if not in recent visits */}
              {editingId && !visitorOptions.some((v) => v.id === form.visitor_id) && form.visitor_id && (
                <SelectOption value={form.visitor_id}>{form.visitor_id.slice(0, 8)}{t('visitors.recurring.form.visitorCurrentSuffix')}</SelectOption>
              )}
              {visitorOptions.map((v) => (
                <SelectOption key={v.id} value={v.id}>
                  {getVisitorLabel(v)}{v.company ? ` — ${v.company}` : ''}
                </SelectOption>
              ))}
            </Select>
            {!editingId && visitorOptions.length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {t('visitors.recurring.form.noRecentVisitors')}
              </p>
            )}
          </div>

          <div>
            <Label className="text-[12px]">
              {t('visitors.form.host')}{hostRequired ? ' *' : ''}
            </Label>
            <HostSelect
              value={form.host_user_id}
              onChange={(host) => setForm((f) => ({ ...f, host_user_id: host?.id ?? '' }))}
              placeholder={t('visitors.form.hostPlaceholder')}
              emptyLabel={t('visitors.form.hostEmpty')}
              buttonTestId="visitors-select-recurring-host"
              searchInputTestId="visitors-search-recurring-host"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.recurring.form.purposeLabel')}</Label>
              <Select
                className="mt-1 h-8 text-[13px]"
                value={form.purpose}
                onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
                data-testid="visitors-select-recurring-purpose"
              >
                {PURPOSES.map((p) => (
                  <SelectOption key={p} value={p}>{t(`visitors.purpose.${p}`)}</SelectOption>
                ))}
              </Select>
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.recurring.form.escortLabel')}</Label>
              <Select
                className="mt-1 h-8 text-[13px]"
                value={form.escort_required ? 'yes' : 'no'}
                onChange={(e) => setForm((f) => ({ ...f, escort_required: e.target.value === 'yes' }))}
                data-testid="visitors-select-recurring-escort"
              >
                <SelectOption value="no">{t('visitors.recurring.form.escortNotRequired')}</SelectOption>
                <SelectOption value="yes">{t('visitors.recurring.form.escortRequired')}</SelectOption>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[12px]">{t('visitors.recurring.form.rruleLabel')}</Label>
            <Select
              className="mt-1 h-8 text-[13px]"
              value={RRULE_PRESETS.some((p) => p.value === form.recurrence_rule) ? form.recurrence_rule : ''}
              onChange={(e) => {
                if (e.target.value) setForm((f) => ({ ...f, recurrence_rule: e.target.value }));
              }}
              data-testid="visitors-select-recurring-rrule-preset"
            >
              <SelectOption value="">{t('visitors.recurring.form.rruleCustom')}</SelectOption>
              {RRULE_PRESETS.map((p) => (
                <SelectOption key={p.value} value={p.value}>{t(p.labelKey)}</SelectOption>
              ))}
            </Select>
            <Input
              className="mt-2 h-8 text-[13px] font-mono"
              value={form.recurrence_rule}
              onChange={(e) => setForm((f) => ({ ...f, recurrence_rule: e.target.value }))}
              placeholder={t('visitors.recurring.form.rrulePlaceholder')}
              data-testid="visitors-input-recurring-rrule"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {t('visitors.recurring.form.rruleHelper')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[12px]">{t('visitors.recurring.form.startDateLabel')}</Label>
              <Input
                type="date"
                className="mt-1 h-8 text-[13px]"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                data-testid="visitors-input-recurring-start"
              />
            </div>
            <div>
              <Label className="text-[12px]">{t('visitors.recurring.form.endDateLabel')}</Label>
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
              <Label className="text-[12px]">{t('visitors.recurring.form.statusLabel')}</Label>
              <Select
                className="mt-1 h-8 text-[13px]"
                value={form.active ? 'active' : 'paused'}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'active' }))}
                data-testid="visitors-select-recurring-status"
              >
                <SelectOption value="active">{t('visitors.recurring.form.statusActive')}</SelectOption>
                <SelectOption value="paused">{t('visitors.recurring.form.statusPaused')}</SelectOption>
              </Select>
            </div>
          )}
        </div>
      </AppModal>
    </div>
  );
}
