import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Clock, Trash2, Save, Copy, Files,
} from 'lucide-react';
import {
  Button, Input, AppModal,
  Select, SelectOption,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import type { SlotInput, AccessTime } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

type DaySlot = { start: string; end: string }; // "HH:MM"

const DAYS = [
  { value: 0, label: 'Sunday',    short: 'Sun' },
  { value: 1, label: 'Monday',    short: 'Mon' },
  { value: 2, label: 'Tuesday',   short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday',  short: 'Thu' },
  { value: 5, label: 'Friday',    short: 'Fri' },
  { value: 6, label: 'Saturday',  short: 'Sat' },
];

const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (UTC+7)' },
  { value: 'UTC',              label: 'UTC' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'Europe/London',    label: 'Europe/London (GMT/BST)' },
];

// 8 labels matching dmw-ai: every 3 hours, 00:00 → 21:00
const TIME_HELPER = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EditDayModal  (click on slot → edit all slots for that day)
// ─────────────────────────────────────────────────────────────────────────────

interface EditDayModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dayOfWeek: number;
  slots: DaySlot[];
  onSave: (slots: DaySlot[]) => void;
}

function EditDayModal({ open, onOpenChange, dayOfWeek, slots, onSave }: EditDayModalProps) {
  const { t } = useTranslation('accessTimes');
  const [local, setLocal] = useState<DaySlot[]>([]);
  const [error, setError] = useState('');
  const dayLabel = t(`days.${dayOfWeek}`, DAYS.find(d => d.value === dayOfWeek)?.label ?? '');

  useEffect(() => {
    if (open) { setLocal(slots.map(s => ({ ...s }))); setError(''); }
  }, [open, slots]);

  const change = (idx: number, field: keyof DaySlot, val: string) => {
    setLocal(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
    setError('');
  };

  const remove = (idx: number) => {
    setLocal(prev => prev.filter((_, i) => i !== idx));
    setError('');
  };

  const handleSave = () => {
    for (let i = 0; i < local.length; i++) {
      if (timeToMin(local[i].start) >= timeToMin(local[i].end)) {
        setError(t('form.slotEndAfterStart', { n: i + 1 }));
        return;
      }
    }
    const sorted = [...local].sort((a, b) => timeToMin(a.start) - timeToMin(b.start));
    for (let i = 1; i < sorted.length; i++) {
      if (timeToMin(sorted[i].start) < timeToMin(sorted[i - 1].end)) {
        setError(t('form.slotsOverlap'));
        return;
      }
    }
    onSave(sorted);
    onOpenChange(false);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={<span className="font-bold text-[15px]">{dayLabel}</span>}
      size="sm"
      showCancelButton
      cancelLabel={t('cancel')}
      errorMessage={error || undefined}
      primaryAction={{ label: t('save'), onClick: handleSave }}
    >
      <div className="space-y-3">
        {local.length === 0 && (
          <p className="text-center text-[13px] text-muted-foreground py-4">{t('form.noTimeSlots')}</p>
        )}
        {local.map((s, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-5 shrink-0 font-bold text-[14px] text-foreground">{idx + 1}</span>
            <Input
              type="time"
              value={s.start}
              onChange={(e) => change(idx, 'start', e.target.value)}
              className="h-8 w-28 font-mono text-[12px]"
            />
            <span className="text-[12px] text-muted-foreground">~</span>
            <Input
              type="time"
              value={s.end}
              onChange={(e) => change(idx, 'end', e.target.value)}
              className="h-8 w-28 font-mono text-[12px]"
            />
            <Button
              variant="ghost" size="sm"
              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
              onClick={() => remove(idx)}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
      </div>
    </AppModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CopyDayModal
// ─────────────────────────────────────────────────────────────────────────────

interface CopyDayModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceDay: number;
  targetDays: number[];
  onConfirm: (days: number[]) => void;
}

function CopyDayModal({ open, onOpenChange, sourceDay, targetDays, onConfirm }: CopyDayModalProps) {
  const { t } = useTranslation('accessTimes');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const sourceDayLabel = t(`days.${sourceDay}`, DAYS.find(d => d.value === sourceDay)?.label ?? '');

  const toggle = (day: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day); else next.add(day);
      return next;
    });
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) setSelected(new Set());
    onOpenChange(v);
  };

  return (
    <AppModal
      open={open}
      onOpenChange={handleOpenChange}
      title={<span className="flex items-center gap-2"><Copy size={15} />{t('form.copyTitle', { day: sourceDayLabel })}</span>}
      size="xs"
      showCancelButton
      cancelLabel={t('cancel')}
      primaryAction={{
        label: selected.size > 0 ? t('form.copyBtnN', { count: selected.size }) : t('save'),
        onClick: () => { onConfirm([...selected]); onOpenChange(false); },
        disabled: selected.size === 0,
      }}
    >
      {targetDays.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('form.noDaysConfigured')}</p>
      ) : (
        <div className="space-y-2">
          {targetDays.map(day => (
            <label key={day} className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={selected.has(day)}
                onChange={() => toggle(day)}
              />
              <span className="text-[13px]">{t(`days.${day}`, DAYS.find(d => d.value === day)?.label ?? '')}</span>
            </label>
          ))}
        </div>
      )}
    </AppModal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DayRow  — mirrors EachDays.js layout from dmw-ai
// ─────────────────────────────────────────────────────────────────────────────

interface DayRowProps {
  dayOfWeek: number;
  slots: DaySlot[];
  canApplyAll: boolean;
  onSlotsChange: (slots: DaySlot[]) => void;
  onRemove: () => void;
  onCopy: () => void;
  onApplyAll: () => void;
}

function DayRow({ dayOfWeek, slots, canApplyAll, onSlotsChange, onRemove, onCopy, onApplyAll }: DayRowProps) {
  const { t } = useTranslation('accessTimes');
  const [editOpen, setEditOpen] = useState(false);
  const dayLabel = t(`days.${dayOfWeek}`, DAYS.find(d => d.value === dayOfWeek)?.label ?? '');

  // Click on empty timeline → create 2-hour slot (same logic as dmw-ai EachDays.onClick)
  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (slots.length >= 4) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const targetMin = Math.ceil(Number(pct.toFixed(2))) * 14.4; // minutes from midnight

    // Find insertion index (same as dmw-ai newDataIndex)
    const newDataIndex = slots.reduce((acc, s) => {
      return timeToMin(s.start) < targetMin ? acc + 1 : acc;
    }, 0);

    const fromMin = Math.round(targetMin / 10) * 10;

    // If prev slot's end overlaps click, abort
    if (slots[newDataIndex - 1] && timeToMin(slots[newDataIndex - 1].end) > fromMin) return;

    // Default 2-hour slot, capped by next slot's start
    const nextSlotStart = slots[newDataIndex] ? timeToMin(slots[newDataIndex].start) : undefined;
    const rawEnd = targetMin + 120;
    const toMin =
      rawEnd > 1440
        ? 1440
        : nextSlotStart !== undefined
        ? rawEnd < nextSlotStart
          ? Math.round(rawEnd / 10) * 10
          : nextSlotStart
        : Math.round(rawEnd / 10) * 10;

    if (fromMin !== toMin) {
      const updated = [
        ...slots.slice(0, newDataIndex),
        { start: minToTime(fromMin), end: minToTime(toMin) },
        ...slots.slice(newDataIndex),
      ];
      onSlotsChange(updated);
    }
  };

  // Double-click on slot → delete it (dmw-ai EachTimzone.handleDoubleClick)
  const handleSlotDoubleClick = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    onSlotsChange(slots.filter((_, i) => i !== idx));
  };

  // Single click on slot → open edit modal for all day slots
  const handleSlotMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditOpen(true);
  };

  return (
    <div className="mb-10">
      {/* Buttons row — right-aligned, above timeline (matches dmw-ai BtnBox) */}
      <div className="mb-2 flex justify-end gap-1">
        <Button
          variant="ghost" size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={onApplyAll}
          disabled={!canApplyAll}
          title={t('form.applyAllTitle')}
        >
          <Files size={15} />
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          onClick={onCopy}
          title={t('form.copyToOtherTitle')}
        >
          <Copy size={15} />
        </Button>
        <Button
          variant="ghost" size="sm"
          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          onClick={onRemove}
          title={t('form.removeDayTitle')}
        >
          <Trash2 size={15} />
        </Button>
      </div>

      {/* Timeline row: day label (1/12) + timeline (11/12) */}
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-[15px] font-bold text-foreground">{dayLabel}</span>

        <div className="flex-1 min-w-0">
          {/* Timeline box — matches dmw-ai <Box> */}
          <div
            className="relative h-[30px] cursor-text select-none border border-border"
            style={{ backgroundColor: 'var(--color-blue-50, #eff6ff)' }}
            onMouseDown={handleTimelineMouseDown}
          >
            {/* Vertical gridlines every 3h */}
            {[3, 6, 9, 12, 15, 18, 21].map(h => (
              <div
                key={h}
                className="absolute inset-y-0 w-px bg-border/50"
                style={{ left: `${(h / 24) * 100}%` }}
              />
            ))}

            {/* Slot blocks — green, matching dmw-ai greenColor */}
            {slots.map((s, idx) => {
              const sm = timeToMin(s.start);
              const em = timeToMin(s.end);
              const left = (sm / 1440) * 100;
              const width = ((em - sm) / 1440) * 100;
              return (
                <div
                  key={idx}
                  className="absolute inset-y-0 flex cursor-pointer items-center justify-center overflow-hidden bg-green-400 hover:bg-green-500 transition-colors"
                  style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                  onMouseDown={handleSlotMouseDown}
                  onDoubleClick={(e) => handleSlotDoubleClick(e, idx)}
                  title={t('form.slotClickHint')}
                >
                  {width > 6 && (
                    <span className="truncate px-0.5 font-mono text-[8px] font-bold leading-none text-white">
                      {s.start}~{s.end}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hour labels — 8-column grid matching dmw-ai TimeHelperBox */}
          <div className="mt-1 grid grid-cols-8 text-[11px] font-bold text-muted-foreground/40">
            {TIME_HELPER.map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Edit modal for all slots of this day */}
      <EditDayModal
        open={editOpen}
        onOpenChange={setEditOpen}
        dayOfWeek={dayOfWeek}
        slots={slots}
        onSave={onSlotsChange}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AccessTimeFormPage
// ─────────────────────────────────────────────────────────────────────────────

export function AccessTimeFormPage() {
  const { t } = useTranslation('accessTimes');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState('');

  // Basic info
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [isActive, setIsActive] = useState(true);

  // Schedule
  const [activeDays, setActiveDays] = useState<number[]>([]);
  const [daySchedule, setDaySchedule] = useState<Map<number, DaySlot[]>>(new Map());

  // Copy modal
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceDay, setCopySourceDay] = useState<number | null>(null);

  // ── Load existing ───────────────────────────────────────────────────────────
  const fetchExisting = useCallback(async () => {
    if (isNew || !id) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/v1/access-times/${id}`);
      const at: AccessTime = data.access_time ?? data;
      setName(at.name);
      setDescription(at.description ?? '');
      setTimezone(at.timezone);
      setIsActive(at.is_active);

      const byDay = new Map<number, DaySlot[]>();
      const days: number[] = [];
      for (const s of at.slots ?? []) {
        if (!byDay.has(s.day_of_week)) { byDay.set(s.day_of_week, []); days.push(s.day_of_week); }
        byDay.get(s.day_of_week)!.push({
          start: s.start_time.slice(0, 5),
          end: s.end_time.slice(0, 5),
        });
      }
      days.sort((a, b) => a - b);
      setActiveDays(days);
      setDaySchedule(byDay);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { fetchExisting(); }, [fetchExisting]);

  const availableDays = useMemo(
    () => DAYS.filter(d => !activeDays.includes(d.value)),
    [activeDays],
  );

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAddDay = (val: string) => {
    const day = Number(val);
    if (activeDays.includes(day)) return;
    setActiveDays(prev => [...prev, day].sort((a, b) => a - b));
    setDaySchedule(prev => new Map(prev).set(day, []));
  };

  const handleRemoveDay = (day: number) => {
    setActiveDays(prev => prev.filter(d => d !== day));
    setDaySchedule(prev => { const m = new Map(prev); m.delete(day); return m; });
  };

  const handleSlotsChange = (day: number, slots: DaySlot[]) => {
    setDaySchedule(prev => new Map(prev).set(day, slots));
  };

  const handleCopy = (day: number) => { setCopySourceDay(day); setShowCopyModal(true); };

  const handleCopyConfirm = (targetDays: number[]) => {
    if (copySourceDay === null) return;
    const src = daySchedule.get(copySourceDay) ?? [];
    setDaySchedule(prev => {
      const m = new Map(prev);
      targetDays.forEach(d => m.set(d, src.map(s => ({ ...s }))));
      return m;
    });
  };

  const handleApplyAll = (sourceDay: number) => {
    const src = daySchedule.get(sourceDay) ?? [];
    setDaySchedule(prev => {
      const m = new Map(prev);
      activeDays.forEach(d => { if (d !== sourceDay) m.set(d, src.map(s => ({ ...s }))); });
      return m;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { setNameError(t('form.nameRequired')); return; }
    setSaving(true);
    setPageError('');
    try {
      const slots: SlotInput[] = [];
      activeDays.forEach(day => {
        (daySchedule.get(day) ?? []).forEach(s => {
          slots.push({
            day_of_week: day,
            start_time: `${s.start}:00`,
            end_time: `${s.end}:00`,
            is_active: true,
          });
        });
      });

      const payload = { name: name.trim(), description: description.trim() || undefined, timezone, is_active: isActive, time_slots: slots };

      if (isNew) {
        await apiFetch('/api/v1/access-times', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        await apiFetch(`/api/v1/access-times/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }
      navigate('/access/access-times');
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-6 overflow-auto"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Header */}
      <div className="shrink-0">
        <button
          onClick={() => navigate('/access/access-times')}
          className="mb-3 flex items-center gap-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={13} />{t('backToList')}
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={20} className="shrink-0 text-primary" />
            <h1 className="text-[18px] font-semibold text-foreground">
              {isNew ? t('form.titleNew') : (name || '…')}
            </h1>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save size={14} className="mr-1.5" />
            {saving ? t('saving') : t('save')}
          </Button>
        </div>
        {pageError && (
          <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
            {pageError}
          </div>
        )}
      </div>

      {/* ── Basic Info ─────────────────────────────────────────────────────── */}
      <section className="shrink-0 rounded-xl border border-border bg-card px-6 py-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">
              {t('form.fieldName')} <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setNameError(''); }}
              placeholder={t('placeholders.name')}
            />
            {nameError && <p className="mt-1 text-[12px] text-destructive">{nameError}</p>}
          </div>

          {/* Timezone */}
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">
              {t('fields.timezone')} <span className="text-destructive">*</span>
            </label>
            <Select value={timezone} onValueChange={setTimezone} placeholder={t('fields.timezone')}>
              {TIMEZONES.map(tz => (
                <SelectOption key={tz.value} value={tz.value}>{tz.label}</SelectOption>
              ))}
            </Select>
          </div>

          {/* Remark */}
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">{t('form.fieldRemark')}</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('form.fieldRemarkPlaceholder')}
            />
          </div>

          {/* Active */}
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="is_active"
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="is_active" className="cursor-pointer select-none text-[13px] text-foreground">
              {t('fields.isActive')}
            </label>
          </div>
        </div>
      </section>

      {/* ── Schedule ───────────────────────────────────────────────────────── */}
      <section className="shrink-0 rounded-xl border border-border bg-card px-6 py-5 pb-6">
        {/* Add Day row */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-foreground">
            {t('form.schedule')}
          </h2>
          <div className="flex items-center gap-2">
            {availableDays.length > 0 && (
              <Select value="" onValueChange={handleAddDay} placeholder={t('form.addDay')} className="w-36">
                {availableDays.map(d => (
                  <SelectOption key={d.value} value={String(d.value)}>{t(`days.${d.value}`, d.label)}</SelectOption>
                ))}
              </Select>
            )}
          </div>
        </div>

        {activeDays.length === 0 ? (
          <div className="rounded-md border border-dashed border-border py-14 text-center text-[13px] text-muted-foreground">
            <Clock size={30} className="mx-auto mb-2 text-muted-foreground/30" />
            <p>{t('form.noDays')}</p>
          </div>
        ) : (
          <div>
            {activeDays.map(day => (
              <DayRow
                key={day}
                dayOfWeek={day}
                slots={daySchedule.get(day) ?? []}
                canApplyAll={activeDays.length > 1}
                onSlotsChange={(s) => handleSlotsChange(day, s)}
                onRemove={() => handleRemoveDay(day)}
                onCopy={() => handleCopy(day)}
                onApplyAll={() => handleApplyAll(day)}
              />
            ))}
            <p className="text-[11px] text-muted-foreground/50">
              {t('form.hint')}
            </p>
          </div>
        )}
      </section>

      {/* Copy Day Modal */}
      {copySourceDay !== null && (
        <CopyDayModal
          open={showCopyModal}
          onOpenChange={setShowCopyModal}
          sourceDay={copySourceDay}
          targetDays={activeDays.filter(d => d !== copySourceDay)}
          onConfirm={handleCopyConfirm}
        />
      )}
    </div>
  );
}
