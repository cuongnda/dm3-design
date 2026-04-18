import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Plus, Pencil, Trash2, Shield, Clock, DoorOpen, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { PageHeader, DataTable, type Column, AppModal, Button, Input, Label } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useRules, useCreateRule, useUpdateRule, useDeleteRule, useAccessDevices, useGroups } from '@/lib/hooks';
import type { AccessRuleDTO } from '@/lib/api';

/* ── Types ─────────────────────────────────────────────────── */

// Map API data to UI format
function mapRule(r: AccessRuleDTO): AccessRule {
  return {
    id: r.id,
    name: r.name,
    doors: r.door_ids,
    groups: r.person_group_ids,
    schedule: {
      days: [0, 1, 2, 3, 4], // TODO: Parse from r.schedule JSON
      startTime: '08:00',
      endTime: '17:00',
    },
    enabled: r.enabled,
    peopleCount: 0, // TODO: Get from group membership
  };
}

interface AccessRule {
  id: string;
  name: string;
  doors: string[];
  groups: string[];
  schedule: { days: number[]; startTime: string; endTime: string };
  enabled: boolean;
  peopleCount: number;
}

interface RuleFormData {
  name: string;
  doors: string[];
  groups: string[];
  days: number[];
  startTime: string;
  endTime: string;
  enabled: boolean;
}

const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dayLabelsFull = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

/* ── Helpers ───────────────────────────────────────────────── */

function scheduleSummary(rule: AccessRule): string {
  const { days, startTime, endTime } = rule.schedule;
  if (days.length === 7 && startTime === '00:00' && endTime === '23:59') return 'Tất cả ngày, 24/7';
  const dayStr = days.length === 5 && days.every((d, i) => d === i)
    ? 'T2–T6'
    : days.length === 2 && days[0] === 5 && days[1] === 6
      ? 'T7–CN'
      : days.length === 6 && days.every((d, i) => d === i)
        ? 'T2–T7'
        : days.map((d) => dayLabels[d]).join(', ');
  return `${dayStr} ${startTime}–${endTime}`;
}

function emptyForm(): RuleFormData {
  return { name: '', doors: [], groups: [], days: [0, 1, 2, 3, 4], startTime: '08:00', endTime: '17:00', enabled: true };
}

function ruleToForm(rule: AccessRule): RuleFormData {
  return {
    name: rule.name,
    doors: [...rule.doors],
    groups: [...rule.groups],
    days: [...rule.schedule.days],
    startTime: rule.schedule.startTime,
    endTime: rule.schedule.endTime,
    enabled: rule.enabled,
  };
}

/* ── Component ─────────────────────────────────────────────── */

export function AccessRulesPage() {
  const { t } = useTranslation('secure');
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleFormData>(emptyForm());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: rulesData } = useRules(1, search ? { search } : undefined);
  const { data: doorsData } = useAccessDevices(1, {}, 100); // Get more access devices for selection
  const { data: groupsData } = useGroups(1, 100); // Get more groups for selection

  const createRuleMutation = useCreateRule();
  const updateRuleMutation = useUpdateRule();
  const deleteRuleMutation = useDeleteRule();

  const rules: AccessRule[] = rulesData?.data?.map(mapRule) || [];
  const availableDoors = doorsData?.data?.map(d => ({ id: d.id, name: d.name })) || [];
  const availableGroups = groupsData?.data?.map(g => ({ id: g.id, name: g.name })) || [];

  const filtered = rules.filter(
    (r) => !search || r.name.toLowerCase().includes(search.toLowerCase())
  );

  // Open create modal
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  // Open edit modal
  const openEdit = (rule: AccessRule) => {
    setEditingId(rule.id);
    setForm(ruleToForm(rule));
    setModalOpen(true);
  };

  // Save (create or update)
  const handleSave = async () => {
    if (!form.name.trim()) return;

    try {
      // Convert form data to API format
      const ruleData = {
        name: form.name,
        door_ids: form.doors,
        person_group_ids: form.groups,
        schedule_inline: {
          days: form.days,
          start_time: form.startTime,
          end_time: form.endTime,
        },
        enabled: form.enabled,
        priority: 0,
      };

      if (editingId) {
        await updateRuleMutation.mutateAsync({ id: editingId, data: ruleData });
      } else {
        await createRuleMutation.mutateAsync(ruleData);
      }
      setModalOpen(false);
    } catch (error) {
      console.error('Failed to save rule:', error);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (deleteId) {
      try {
        await deleteRuleMutation.mutateAsync(deleteId);
        setDeleteId(null);
        if (expandedId === deleteId) setExpandedId(null);
      } catch (error) {
        console.error('Failed to delete rule:', error);
      }
    }
  };

  // Toggle enabled
  const toggleEnabled = async (id: string) => {
    try {
      const rule = rules.find(r => r.id === id);
      if (rule) {
        await updateRuleMutation.mutateAsync({
          id,
          data: { enabled: !rule.enabled },
        });
      }
    } catch (error) {
      console.error('Failed to toggle rule:', error);
    }
  };

  // Toggle multi-select
  const toggleMulti = (field: 'doors' | 'groups' | 'days', value: string | number) => {
    setForm((prev) => {
      if (field === 'days') {
        const days = prev.days.includes(value as number)
          ? prev.days.filter((d) => d !== value)
          : [...prev.days, value as number].sort();
        return { ...prev, days };
      }
      const arr = prev[field] as string[];
      const updated = arr.includes(value as string)
        ? arr.filter((v) => v !== value)
        : [...arr, value as string];
      return { ...prev, [field]: updated };
    });
  };

  const doorName = (id: string) => availableDoors.find((d) => d.id === id)?.name ?? id;
  const groupName = (id: string) => availableGroups.find((g) => g.id === id)?.name ?? id;

  const columns: Column<AccessRule>[] = [
    {
      key: 'expand', header: '', width: '40px',
      render: (r) => (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === r.id ? null : r.id); }}
        >
          {expandedId === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
      ),
    },
    {
      key: 'name', header: t('accessRules.title'), sortable: true,
      render: (r) => (
        <span className={cn('font-medium', r.enabled ? 'text-foreground' : 'text-muted-foreground')}>
          {r.name}
        </span>
      ),
    },
    {
      key: 'doors', header: /* TODO: add i18n key */'Doors', width: '100px',
      render: (r) => (
        <span className="flex items-center gap-1 text-muted-foreground text-[12px]">
          <DoorOpen size={13} className="text-secure" />
          {r.doors.length}
        </span>
      ),
    },
    {
      key: 'groups', header: /* TODO: add i18n key */'Groups', width: '100px',
      render: (r) => (
        <span className="flex items-center gap-1 text-muted-foreground text-[12px]">
          <Users size={13} className="text-manage" />
          {r.groups.length}
        </span>
      ),
    },
    {
      key: 'schedule', header: /* TODO: add i18n key */'Schedule', width: '220px',
      render: (r) => (
        <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Clock size={13} className="text-operate" />
          {scheduleSummary(r)}
        </span>
      ),
    },
    {
      key: 'enabled', header: t('accessControl.table.status'), width: '100px',
      render: (r) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleEnabled(r.id); }}
          className={cn(
            'w-9 h-5 rounded-full relative transition-colors cursor-pointer',
            r.enabled ? 'bg-secure' : 'bg-muted'
          )}
        >
          <span className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            r.enabled ? 'left-[18px]' : 'left-0.5'
          )} />
        </button>
      ),
    },
    {
      key: 'actions', header: t('common:table.actions'), width: '80px',
      render: (r) => (
        <span className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => { e.stopPropagation(); openEdit(r); }}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}
            className="hover:text-error"
          >
            <Trash2 size={14} />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate('/secure/access-control')}>
          <ArrowLeft size={18} />
        </Button>
        <PageHeader title={t('accessRules.title')}>
          <Button size="sm" onClick={openCreate}>
            <Plus size={14} />
            {t('accessRules.addRule')}
          </Button>
        </PageHeader>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('accessControl.searchPlaceholder')}
          className="flex-1 h-8 text-[13px]"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-secure/10 flex items-center justify-center">
            <Shield size={18} className="text-secure" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-foreground">{rules.length}</p>
            <p className="text-[11px] text-muted-foreground">{t('accessRules.title')}</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-success/10 flex items-center justify-center">
            <Shield size={18} className="text-success" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-foreground">{rules.filter((r) => r.enabled).length}</p>
            <p className="text-[11px] text-muted-foreground">{/* TODO: add i18n key */}Active</p>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-operate/10 flex items-center justify-center">
            <Users size={18} className="text-operate" />
          </div>
          <div>
            <p className="text-[18px] font-semibold text-foreground">{rules.reduce((s, r) => s + r.peopleCount, 0)}</p>
            <p className="text-[11px] text-muted-foreground">{/* TODO: add i18n key */}People Authorized</p>
          </div>
        </div>
      </div>

      {/* Table with expandable rows */}
      <div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          onRowClick={(r) => setExpandedId(expandedId === r.id ? null : r.id)}
          rowClassName={(r) => (!r.enabled ? 'opacity-60' : '')}
        />

        {/* Expanded detail (rendered outside DataTable as overlay is complex, use inline approach) */}
        {expandedId && (
          <ExpandedRuleDetail
            rule={rules.find((r) => r.id === expandedId)!}
            doorName={doorName}
            groupName={groupName}
          />
        )}
      </div>

      {/* Create/Edit Modal */}
      <AppModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editingId ? /* TODO: add i18n key */'Edit Rule' : /* TODO: add i18n key */'Create New Rule'}
        description={editingId ? /* TODO: add i18n key */'Update access rule details' : t('accessRules.description')}
        size="xl"
        className="max-h-[85vh]"
        showCancelButton
        cancelLabel={/* TODO: add i18n key */'Cancel'}
        cancelDisabled={createRuleMutation.isPending || updateRuleMutation.isPending}
        submitDisabled={!form.name.trim()}
        primaryAction={{
          label: editingId ? /* TODO: add i18n key */'Update' : t('accessRules.addRule'),
          onClick: handleSave,
          loading: createRuleMutation.isPending || updateRuleMutation.isPending,
          disabled: createRuleMutation.isPending || updateRuleMutation.isPending,
        }}
      >
        <div className="space-y-4">
            {/* Rule name */}
            <div>
              <Label className="text-[12px]">{t('accessRules.title')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={/* TODO: add i18n key */"VD: Nhân viên — Giờ hành chính"}
                className="mt-1 h-8 text-[13px]"
              />
            </div>

            {/* Doors multi-select */}
            <div>
              <Label className="text-[12px]">
                {/* TODO: add i18n key */}Doors <span className="text-muted-foreground">({form.doors.length} selected)</span>
              </Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto p-2 bg-input border border-border rounded-md mt-1">
                {availableDoors.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={form.doors.includes(d.id)}
                      onChange={() => toggleMulti('doors', d.id)}
                      className="w-3.5 h-3.5 rounded border-border accent-secure"
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Groups multi-select */}
            <div>
              <Label className="text-[12px]">
                {/* TODO: add i18n key */}Access Groups <span className="text-muted-foreground">({form.groups.length} selected)</span>
              </Label>
              <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto p-2 bg-input border border-border rounded-md mt-1">
                {availableGroups.map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={form.groups.includes(g.id)}
                      onChange={() => toggleMulti('groups', g.id)}
                      className="w-3.5 h-3.5 rounded border-border accent-secure"
                    />
                    {g.name}
                  </label>
                ))}
              </div>
            </div>

            {/* Schedule: days */}
            <div>
              <Label className="text-[12px]">{/* TODO: add i18n key */}Days of Week</Label>
              <div className="flex gap-1.5 mt-1">
                {dayLabels.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleMulti('days', i)}
                    className={cn(
                      'flex-1 py-1.5 rounded text-[11px] font-medium border transition-colors cursor-pointer',
                      form.days.includes(i)
                        ? 'bg-secure/20 border-secure/50 text-secure'
                        : 'bg-input border-border text-muted-foreground hover:border-border/80'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Schedule: time range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[12px]">{/* TODO: add i18n key */}From</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                  className="mt-1 h-8 text-[13px]"
                />
              </div>
              <div>
                <Label className="text-[12px]">{/* TODO: add i18n key */}To</Label>
                <Input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                  className="mt-1 h-8 text-[13px]"
                />
              </div>
            </div>

            {/* Enable toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-[12px]">{/* TODO: add i18n key */}Enable Rule</Label>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
                className={cn(
                  'w-9 h-5 rounded-full relative transition-colors cursor-pointer',
                  form.enabled ? 'bg-secure' : 'bg-muted'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                  form.enabled ? 'left-[18px]' : 'left-0.5'
                )} />
              </button>
            </div>
          </div>
      </AppModal>

      {/* Delete Confirmation */}
      <AppModal
        open={!!deleteId}
        onOpenChange={(open) => { if (!open) setDeleteId(null); }}
        title={/* TODO: add i18n key */'Delete Rule'}
        description={/* TODO: add i18n key */`Are you sure you want to delete rule "${rules.find((r) => r.id === deleteId)?.name}"? This action cannot be undone.`}
        size="md"
        showCancelButton
        cancelLabel={/* TODO: add i18n key */'Cancel'}
        cancelDisabled={deleteRuleMutation.isPending}
        primaryAction={{
          label: /* TODO: add i18n key */'Delete',
          variant: 'destructive',
          onClick: handleDelete,
          loading: deleteRuleMutation.isPending,
          disabled: deleteRuleMutation.isPending,
        }}
      />
    </div>
  );
}

/* ── Expanded Detail ───────────────────────────────────────── */

function ExpandedRuleDetail({
  rule,
  doorName,
  groupName,
}: {
  rule: AccessRule;
  doorName: (id: string) => string;
  groupName: (id: string) => string;
}) {
  return (
    <div className="bg-muted/30 border border-border border-t-0 rounded-b-lg p-4 -mt-1 mb-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Doors */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <DoorOpen size={12} className="text-secure" />
            {/* TODO: add i18n key */}Doors ({rule.doors.length})
          </h4>
          <div className="space-y-1">
            {rule.doors.map((id) => (
              <div key={id} className="text-[12px] text-muted-foreground py-0.5 px-2 bg-card rounded">
                {doorName(id)}
              </div>
            ))}
          </div>
        </div>

        {/* Groups */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <Users size={12} className="text-manage" />
            {/* TODO: add i18n key */}Access Groups ({rule.groups.length})
          </h4>
          <div className="space-y-1">
            {rule.groups.map((id) => (
              <div key={id} className="text-[12px] text-muted-foreground py-0.5 px-2 bg-card rounded">
                {groupName(id)}
              </div>
            ))}
          </div>
        </div>

        {/* Schedule + Stats */}
        <div>
          <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
            <Clock size={12} className="text-operate" />
            {/* TODO: add i18n key */}Schedule
          </h4>
          <div className="space-y-1 mb-3">
            <div className="text-[12px] text-muted-foreground">
              <span className="text-muted-foreground/60">{/* TODO: add i18n key */}Days:</span>{' '}
              {rule.schedule.days.map((d) => dayLabelsFull[d]).join(', ')}
            </div>
            <div className="text-[12px] text-muted-foreground">
              <span className="text-muted-foreground/60">{/* TODO: add i18n key */}Hours:</span>{' '}
              {rule.schedule.startTime} – {rule.schedule.endTime}
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 bg-card rounded">
            <Users size={14} className="text-success" />
            <span className="text-[12px] text-muted-foreground">
              <span className="text-foreground font-medium">{rule.peopleCount}</span> {/* TODO: add i18n key */}people authorized
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
