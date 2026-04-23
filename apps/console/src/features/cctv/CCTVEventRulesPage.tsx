import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppModal, Button, Input, Label, PageHeader } from '@dm3/ui';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  listEventRules,
  createEventRule,
  updateEventRule,
  deleteEventRule,
  listAccessPoints,
  listCameras,
  type EventRuleDTO,
  type EventRuleInput,
  type EventRuleScope,
} from '@dm3/api-client';

// Decision vocabulary mirrors the access-svc consumer. New values added there
// will still be accepted by the backend (rules filter via array contains) —
// this list is purely the UI picker. TODO: serve via /vocab endpoint.
const DECISIONS = ['granted', 'denied', 'unknown', 'duress'] as const;

// Event types the consumer currently forwards. `access.log` is today's only
// live one — listed extras are for forward-compatibility so rules can be
// authored once and "light up" when the consumer broadens its filter.
const EVENT_TYPES = ['access.log', 'face.match', 'face.unknown', 'door.forced'] as const;

const emptyInput: EventRuleInput = {
  scope_kind: 'tenant',
  access_point_id: null,
  camera_device_id: null,
  decisions: [],
  event_types: [],
  snapshot_enabled: true,
  record_enabled: true,
  pre_roll_sec: 10,
  post_roll_sec: 20,
  priority: 1000,
  enabled: true,
};

export function CCTVEventRulesPage() {
  const { t } = useTranslation('common');
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['cctv-event-rules'],
    queryFn: () => listEventRules(),
  });
  const { data: accessPointsResp } = useQuery({
    queryKey: ['access-points-all'],
    queryFn: () => listAccessPoints({ limit: 500 }),
  });
  const { data: camerasResp } = useQuery({
    queryKey: ['cctv-cameras-all'],
    queryFn: () => listCameras({ limit: 500 }),
  });

  const accessPoints = accessPointsResp?.data ?? [];
  const cameras = camerasResp?.data ?? [];

  const [editing, setEditing] = useState<EventRuleDTO | null>(null);
  const [creating, setCreating] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: EventRuleInput) => createEventRule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cctv-event-rules'] });
      setCreating(false);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: EventRuleInput }) => updateEventRule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cctv-event-rules'] });
      setEditing(null);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEventRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cctv-event-rules'] }),
  });

  const scopeLabel = (r: EventRuleDTO) => {
    if (r.scope_kind === 'tenant') return t('cctv.eventRules.scope.tenant');
    if (r.scope_kind === 'access_point') {
      const ap = accessPoints.find((a) => a.id === r.access_point_id);
      return `${t('cctv.eventRules.scope.apPrefix')} ${ap?.name ?? r.access_point_id}`;
    }
    const cam = cameras.find((c) => c.id === r.camera_device_id);
    return `${t('cctv.eventRules.scope.camPrefix')} ${cam?.name ?? r.camera_device_id}`;
  };

  // Raw token → display label. Keep API values untouched (granted/denied/…),
  // show them translated in the UI. Replace dots in event-type tokens
  // (access.log) with underscores because i18next's default key separator is
  // dot; using access_log in the key avoids the nested-lookup ambiguity.
  const decisionLabel = (d: string) => t(`cctv.eventRules.decisions.${d}`, { defaultValue: d });
  const eventTypeLabel = (et: string) => t(`cctv.eventRules.eventTypes.${et.replace(/\./g, '_')}`, { defaultValue: et });
  const joinLabels = (values: string[], kind: 'decision' | 'eventType') => {
    if (values.length === 0) return t('cctv.eventRules.anyMatch');
    const fn = kind === 'decision' ? decisionLabel : eventTypeLabel;
    return values.map(fn).join(', ');
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t('cctv.eventRules.title')}
        description={t('cctv.eventRules.description')}
      >
        <Button size="sm" onClick={() => setCreating(true)} data-testid="cctv-button-new-rule">
          <Plus size={16} className="mr-1" /> {t('cctv.eventRules.newRule')}
        </Button>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">{t('cctv.common.loading')}</div>
        ) : rules.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-[13px]">
            {t('cctv.eventRules.noRules')}
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="text-left text-muted-foreground text-[12px]">
              <tr>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.scope')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.decisions')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.eventTypes')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.snapshot')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.record')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.rolls')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.priority')}</th>
                <th className="py-2 pr-3">{t('cctv.eventRules.columns.enabled')}</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-2 pr-3">{scopeLabel(r)}</td>
                  <td className="py-2 pr-3">{joinLabels(r.decisions, 'decision')}</td>
                  <td className="py-2 pr-3">{joinLabels(r.event_types, 'eventType')}</td>
                  <td className="py-2 pr-3">{r.snapshot_enabled ? '✓' : '—'}</td>
                  <td className="py-2 pr-3">{r.record_enabled ? '✓' : '—'}</td>
                  <td className="py-2 pr-3">{r.pre_roll_sec}s / {r.post_roll_sec}s</td>
                  <td className="py-2 pr-3">{r.priority}</td>
                  <td className="py-2 pr-3">{r.enabled ? '✓' : '—'}</td>
                  <td className="py-2 pr-3 text-right">
                    <Button size="xs" variant="ghost" onClick={() => setEditing(r)} data-testid={`cctv-button-edit-rule-${r.id}`}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (window.confirm(t('cctv.eventRules.confirmDelete'))) {
                          deleteMutation.mutate(r.id);
                        }
                      }}
                      data-testid={`cctv-button-delete-rule-${r.id}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RuleFormModal
        open={creating || !!editing}
        initial={editing ? inputFromRule(editing) : emptyInput}
        accessPoints={accessPoints.map((a) => ({ id: a.id, name: a.name }))}
        cameras={cameras.map((c) => ({ id: c.id, name: c.name }))}
        submitting={createMutation.isPending || updateMutation.isPending}
        isEditing={!!editing}
        onCancel={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(data) => {
          if (editing) updateMutation.mutate({ id: editing.id, data });
          else createMutation.mutate(data);
        }}
      />
    </div>
  );
}

function inputFromRule(r: EventRuleDTO): EventRuleInput {
  return {
    scope_kind: r.scope_kind,
    access_point_id: r.access_point_id ?? null,
    camera_device_id: r.camera_device_id ?? null,
    decisions: r.decisions,
    event_types: r.event_types,
    snapshot_enabled: r.snapshot_enabled,
    record_enabled: r.record_enabled,
    pre_roll_sec: r.pre_roll_sec,
    post_roll_sec: r.post_roll_sec,
    priority: r.priority,
    enabled: r.enabled,
    notes: r.notes ?? null,
  };
}

interface RuleFormProps {
  open: boolean;
  initial: EventRuleInput;
  accessPoints: { id: string; name: string }[];
  cameras: { id: string; name: string }[];
  submitting: boolean;
  isEditing: boolean;
  onCancel: () => void;
  onSubmit: (data: EventRuleInput) => void;
}

function RuleFormModal({ open, initial, accessPoints, cameras, submitting, isEditing, onCancel, onSubmit }: RuleFormProps) {
  const { t } = useTranslation('common');
  const [form, setForm] = useState<EventRuleInput>(initial);

  // Same translation helpers as the list — pill buttons show the friendly
  // label but the underlying toggle still emits the raw API token.
  const decisionLabel = (d: string) => t(`cctv.eventRules.decisions.${d}`, { defaultValue: d });
  const eventTypeLabel = (et: string) => t(`cctv.eventRules.eventTypes.${et.replace(/\./g, '_')}`, { defaultValue: et });

  // Reset form whenever the modal opens with a new initial (create vs edit).
  // Using a key on AppModal would work too but this is fewer re-renders.
  // Note: intentional dep on `open` + `initial` identity change.
  if (open && form !== initial && !(form as any).__touched) {
    setForm({ ...initial, ...(form as any) });
  }

  const set = <K extends keyof EventRuleInput>(k: K, v: EventRuleInput[K]) => {
    setForm((prev) => ({ ...prev, [k]: v, __touched: true } as EventRuleInput));
  };

  const toggleMulti = (list: string[] | undefined, value: string): string[] => {
    const next = new Set(list ?? []);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return Array.from(next);
  };

  return (
    <AppModal open={open} onOpenChange={(v) => { if (!v) onCancel(); }} title={isEditing ? t('cctv.eventRules.editRule') : t('cctv.eventRules.newRule')}>
      <div className="space-y-3">
        <div>
          <Label className="text-[12px]">{t('cctv.eventRules.columns.scope')}</Label>
          <select
            className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
            value={form.scope_kind}
            onChange={(e) => {
              const s = e.target.value as EventRuleScope;
              setForm((prev) => ({
                ...prev,
                scope_kind: s,
                access_point_id: s === 'access_point' ? prev.access_point_id ?? null : null,
                camera_device_id: s === 'camera' ? prev.camera_device_id ?? null : null,
                __touched: true,
              } as EventRuleInput));
            }}
          >
            <option value="tenant">{t('cctv.eventRules.scope.tenant')}</option>
            <option value="access_point">{t('cctv.eventRules.scope.accessPoint')}</option>
            <option value="camera">{t('cctv.eventRules.scope.camera')}</option>
          </select>
        </div>

        {form.scope_kind === 'access_point' && (
          <div>
            <Label className="text-[12px]">{t('cctv.eventRules.scope.accessPoint')}</Label>
            <select
              className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
              value={form.access_point_id ?? ''}
              onChange={(e) => set('access_point_id', e.target.value || null)}
            >
              <option value="">{t('cctv.eventRules.scope.selectAP')}</option>
              {accessPoints.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {form.scope_kind === 'camera' && (
          <div>
            <Label className="text-[12px]">{t('cctv.eventRules.scope.camera')}</Label>
            <select
              className="mt-1 w-full h-8 rounded-md border border-border bg-background px-2 text-[13px]"
              value={form.camera_device_id ?? ''}
              onChange={(e) => set('camera_device_id', e.target.value || null)}
            >
              <option value="">{t('cctv.eventRules.scope.selectCamera')}</option>
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <Label className="text-[12px]">{t('cctv.eventRules.fields.decisions')}</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {DECISIONS.map((d) => {
              const active = (form.decisions ?? []).includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => set('decisions', toggleMulti(form.decisions, d))}
                  className={`px-2 py-1 rounded border text-[12px] ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                >{decisionLabel(d)}</button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('cctv.eventRules.fields.decisionsHint')}</p>
        </div>

        <div>
          <Label className="text-[12px]">{t('cctv.eventRules.fields.eventTypes')}</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {EVENT_TYPES.map((ev) => {
              const active = (form.event_types ?? []).includes(ev);
              return (
                <button
                  key={ev}
                  type="button"
                  onClick={() => set('event_types', toggleMulti(form.event_types, ev))}
                  className={`px-2 py-1 rounded border text-[12px] ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border'}`}
                >{eventTypeLabel(ev)}</button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('cctv.eventRules.fields.eventTypesHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={!!form.snapshot_enabled}
              onChange={(e) => set('snapshot_enabled', e.target.checked)}
            /> {t('cctv.eventRules.fields.snapshot')}
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={!!form.record_enabled}
              onChange={(e) => set('record_enabled', e.target.checked)}
            /> {t('cctv.eventRules.fields.record')}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">{t('cctv.eventRules.fields.preRoll')}</Label>
            <Input
              type="number"
              min={0}
              max={120}
              className="mt-1 h-8 text-[13px]"
              value={form.pre_roll_sec ?? 10}
              onChange={(e) => set('pre_roll_sec', Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-[12px]">{t('cctv.eventRules.fields.postRoll')}</Label>
            <Input
              type="number"
              min={0}
              max={300}
              className="mt-1 h-8 text-[13px]"
              value={form.post_roll_sec ?? 20}
              onChange={(e) => set('post_roll_sec', Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-[12px]">{t('cctv.eventRules.fields.priority')}</Label>
            <Input
              type="number"
              className="mt-1 h-8 text-[13px]"
              value={form.priority ?? 1000}
              onChange={(e) => set('priority', Number(e.target.value))}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">{t('cctv.eventRules.fields.priorityHint')}</p>
          </div>
          <label className="flex items-center gap-2 mt-6 text-[13px]">
            <input
              type="checkbox"
              checked={form.enabled !== false}
              onChange={(e) => set('enabled', e.target.checked)}
            /> {t('cctv.eventRules.fields.enabled')}
          </label>
        </div>

        <div>
          <Label className="text-[12px]">{t('cctv.eventRules.fields.notes')}</Label>
          <Input
            className="mt-1 h-8 text-[13px]"
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value || null)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onCancel}>{t('cctv.common.cancel')}</Button>
          <Button
            size="sm"
            disabled={submitting}
            onClick={() => {
              // Strip the UI-only __touched flag before sending.
              const clean: EventRuleInput = { ...form };
              delete (clean as any).__touched;
              onSubmit(clean);
            }}
            className="bg-[#3B82F6] hover:bg-[#2563EB]"
          >
            {submitting ? t('cctv.common.saving') : t('cctv.common.saveChanges')}
          </Button>
        </div>
      </div>
    </AppModal>
  );
}
