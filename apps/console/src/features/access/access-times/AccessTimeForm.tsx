import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Copy, Plus, Trash2 } from 'lucide-react';
import { Button, Card, Input, Select, SelectOption } from '@dm3/ui';
import { cn } from '@/lib/utils';

export interface TimeSlotInput {
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_name: string;
    is_active: boolean;
}

export interface AccessTimeFormValues {
    name: string;
    description: string;
    timezone: string;
    is_active: boolean;
    slots: TimeSlotInput[];
}

export const emptyAccessTimeValues: AccessTimeFormValues = {
    name: '',
    description: '',
    timezone: 'Asia/Ho_Chi_Minh',
    is_active: true,
    slots: [],
};

const TIMEZONES = [
    { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh (UTC+7)' },
    { value: 'Asia/Bangkok', label: 'Bangkok (UTC+7)' },
    { value: 'Asia/Seoul', label: 'Seoul (UTC+9)' },
    { value: 'UTC', label: 'UTC' },
];

const PRESETS: Record<string, TimeSlotInput[]> = {
    'Standard Working Hours': [1, 2, 3, 4, 5].flatMap((d) => [
        { day_of_week: d, start_time: '08:00', end_time: '12:00', slot_name: 'Morning', is_active: true },
        { day_of_week: d, start_time: '13:00', end_time: '17:00', slot_name: 'Afternoon', is_active: true },
    ]),
    '24/7 Access': [0, 1, 2, 3, 4, 5, 6].map((d) => ({
        day_of_week: d,
        start_time: '00:00',
        end_time: '23:59',
        slot_name: 'Full Access',
        is_active: true,
    })),
    'Night Shift': [1, 2, 3, 4, 5].map((d) => ({
        day_of_week: d,
        start_time: '18:00',
        end_time: '23:59',
        slot_name: 'Night',
        is_active: true,
    })),
};

function parseTimeInput(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 4);
    if (digits.length === 0) return '';
    if (digits.length <= 2) return parseInt(digits, 10) > 23 ? '23' : digits;
    const h = Math.min(parseInt(digits.slice(0, 2), 10), 23).toString().padStart(2, '0');
    const mRaw = digits.slice(2);
    const m =
        digits.length === 3
            ? mRaw
            : Math.min(parseInt(mRaw, 10), 59).toString().padStart(2, '0');
    return `${h}:${m}`;
}

const isTimeValid = (t: string) => /^\d{2}:\d{2}$/.test(t);
const isSlotInvalid = (s: TimeSlotInput) =>
    !isTimeValid(s.start_time) || !isTimeValid(s.end_time) || s.start_time >= s.end_time;

/** Validate values; returns error message or null. */
export function validateAccessTimeValues(values: AccessTimeFormValues): string | null {
    if (!values.name.trim()) return 'Name is required';
    for (let i = 0; i < values.slots.length; i++) {
        const s = values.slots[i];
        if (!isTimeValid(s.start_time) || !isTimeValid(s.end_time)) {
            return `Slot ${i + 1}: invalid time format (HH:MM)`;
        }
        if (s.start_time >= s.end_time) {
            return `Slot ${i + 1}: end time must be after start time`;
        }
    }
    return null;
}

interface AccessTimeFormProps {
    values: AccessTimeFormValues;
    onChange: (next: AccessTimeFormValues) => void;
    disabled?: boolean;
    /** Show form as a single column (for narrower modals). */
    compact?: boolean;
}

export function AccessTimeForm({ values, onChange, disabled, compact }: AccessTimeFormProps) {
    const { t } = useTranslation('accessTimes');
    const [editingSlotIdx, setEditingSlotIdx] = useState<number | null>(null);

    const DAY_NAMES = [
        t('days.sun', 'Sun'),
        t('days.mon', 'Mon'),
        t('days.tue', 'Tue'),
        t('days.wed', 'Wed'),
        t('days.thu', 'Thu'),
        t('days.fri', 'Fri'),
        t('days.sat', 'Sat'),
    ];

    const update = <K extends keyof AccessTimeFormValues>(key: K, value: AccessTimeFormValues[K]) =>
        onChange({ ...values, [key]: value });

    const addSlot = () => {
        const newSlot: TimeSlotInput = {
            day_of_week: 0,
            start_time: '08:00',
            end_time: '17:00',
            slot_name: '',
            is_active: true,
        };
        onChange({ ...values, slots: [newSlot, ...values.slots] });
        setEditingSlotIdx(0);
    };

    const removeSlot = (index: number) => {
        onChange({ ...values, slots: values.slots.filter((_, i) => i !== index) });
        if (editingSlotIdx === index) setEditingSlotIdx(null);
        else if (editingSlotIdx !== null && editingSlotIdx > index)
            setEditingSlotIdx(editingSlotIdx - 1);
    };

    const updateSlot = (index: number, field: keyof TimeSlotInput, value: unknown) => {
        onChange({
            ...values,
            slots: values.slots.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
        });
    };

    const applyPreset = (presetName: string) => {
        const preset = PRESETS[presetName];
        if (!preset) return;
        onChange({
            ...values,
            slots: preset,
            name: values.name ? values.name : presetName,
        });
        setEditingSlotIdx(null);
    };

    const grouped: Record<number, { slot: TimeSlotInput; origIdx: number }[]> = {};
    values.slots.forEach((s, origIdx) => {
        if (!grouped[s.day_of_week]) grouped[s.day_of_week] = [];
        grouped[s.day_of_week].push({ slot: s, origIdx });
    });

    const sortedIndices = values.slots
        .map((s, i) => ({ s, i }))
        .sort((a, b) =>
            a.s.day_of_week !== b.s.day_of_week
                ? a.s.day_of_week - b.s.day_of_week
                : a.s.start_time.localeCompare(b.s.start_time),
        )
        .map(({ i }) => i);

    const DetailsCard = (
        <Card className="p-4 space-y-3">
            <h3 className="font-semibold">{t('form.name', 'Name')}</h3>
            <div>
                <label className="text-xs font-medium text-muted-foreground">
                    {t('form.name', 'Name')} *
                </label>
                <Input
                    value={values.name}
                    onChange={(e) => update('name', e.target.value)}
                    className="h-8 text-[13px]"
                    disabled={disabled}
                    data-testid="access-time-input-name"
                />
            </div>
            <div>
                <label className="text-xs font-medium text-muted-foreground">
                    {t('form.description', 'Description')}
                </label>
                <Input
                    value={values.description}
                    onChange={(e) => update('description', e.target.value)}
                    className="h-8 text-[13px]"
                    disabled={disabled}
                />
            </div>
            <div>
                <label className="text-xs font-medium text-muted-foreground">
                    {t('form.timezone', 'Timezone')} *
                </label>
                <Select
                    value={values.timezone}
                    onChange={(e) => update('timezone', e.target.value)}
                    className="h-8 text-[12px]"
                    disabled={disabled}
                >
                    {TIMEZONES.map((tz) => (
                        <SelectOption key={tz.value} value={tz.value}>
                            {tz.label}
                        </SelectOption>
                    ))}
                </Select>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={values.is_active}
                    onChange={(e) => update('is_active', e.target.checked)}
                    id="is-active"
                    disabled={disabled}
                />
                <label htmlFor="is-active" className="text-sm">
                    {t('form.active', 'Active')}
                </label>
            </div>
            <div className="border-t pt-3">
                <label className="text-xs font-medium text-muted-foreground mb-2 block">
                    {t('form.presets', 'Presets')}
                </label>
                <div className="space-y-1">
                    {Object.keys(PRESETS).map((p) => (
                        <Button
                            key={p}
                            variant="outline"
                            size="sm"
                            className="w-full text-xs justify-start"
                            onClick={() => applyPreset(p)}
                            disabled={disabled}
                        >
                            <Copy className="w-3 h-3 mr-1" /> {p}
                        </Button>
                    ))}
                </div>
            </div>
        </Card>
    );

    const ScheduleCard = (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{t('form.weeklySchedule', 'Weekly Schedule')}</h3>
                <Button size="sm" variant="outline" onClick={addSlot} disabled={disabled}>
                    <Plus className="w-4 h-4 mr-1" /> {t('form.addSlot', 'Add Slot')}
                </Button>
            </div>
            <div className="grid grid-cols-7 gap-1.5" onClick={() => setEditingSlotIdx(null)}>
                {DAY_NAMES.map((day, dayIdx) => (
                    <div key={dayIdx} className="text-center">
                        <div className="text-[11px] font-medium text-muted-foreground mb-1">{day}</div>
                        <div className="min-h-[60px] bg-muted/50 rounded p-1 space-y-0.5">
                            {(grouped[dayIdx] || []).map(({ slot, origIdx }) => {
                                const isPillEditing = origIdx === editingSlotIdx;
                                return (
                                    <div
                                        key={origIdx}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingSlotIdx(isPillEditing ? null : origIdx);
                                        }}
                                        className={cn(
                                            'text-[10px] p-1 rounded transition-all text-center',
                                            isSlotInvalid(slot)
                                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                                : slot.is_active
                                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                                                  : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                                            isPillEditing ? 'ring-2 ring-primary ring-inset' : 'cursor-pointer select-none',
                                        )}
                                    >
                                        {isPillEditing ? (
                                            <div onClick={(e) => e.stopPropagation()} className="relative flex items-center justify-center gap-0.5">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={slot.start_time}
                                                    onChange={(e) => updateSlot(origIdx, 'start_time', parseTimeInput(e.target.value))}
                                                    className="w-[30px] min-w-0 bg-transparent border-b border-primary/60 text-[10px] text-center outline-none cursor-text"
                                                    placeholder="HH:MM"
                                                />
                                                <span className="text-[9px] shrink-0">–</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={slot.end_time}
                                                    onChange={(e) => updateSlot(origIdx, 'end_time', parseTimeInput(e.target.value))}
                                                    className="w-[30px] min-w-0 bg-transparent border-b border-primary/60 text-[10px] text-center outline-none cursor-text"
                                                    placeholder="HH:MM"
                                                />
                                                <button
                                                    onClick={() => removeSlot(origIdx)}
                                                    className="absolute right-0 text-destructive hover:opacity-70 cursor-pointer"
                                                >
                                                    <Trash2 className="w-2.5 h-2.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="cursor-pointer">
                                                {slot.start_time}–{slot.end_time}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );

    const SlotListCard = (
        <Card className="p-4">
            <h3 className="font-semibold mb-3">
                {t('form.timeSlots', 'Time Slots')} ({values.slots.length})
            </h3>
            {values.slots.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                    <Clock className="w-8 h-8 mx-auto mb-1 opacity-50" />
                    <p className="text-sm">{t('form.noSlots', 'No time slots')}</p>
                </div>
            ) : null}
            <div className="space-y-2">
                {sortedIndices.map((origIdx) => {
                    const slot = values.slots[origIdx];
                    const isSelected = origIdx === editingSlotIdx;
                    return (
                        <div
                            key={origIdx}
                            onClick={() => setEditingSlotIdx(origIdx === editingSlotIdx ? null : origIdx)}
                            className={cn(
                                'flex items-center gap-2 border rounded py-2 px-3 cursor-pointer transition-colors',
                                isSlotInvalid(slot)
                                    ? 'border-destructive/60 bg-destructive/5'
                                    : isSelected
                                      ? 'border-primary/50 bg-primary/5'
                                      : 'border-border/50 hover:bg-muted/30',
                            )}
                        >
                            <Select
                                value={slot.day_of_week.toString()}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    updateSlot(origIdx, 'day_of_week', parseInt(e.target.value));
                                }}
                                className="w-24 text-[12px] shrink-0"
                                disabled={disabled}
                            >
                                {DAY_NAMES.map((d, i) => (
                                    <SelectOption key={i} value={i.toString()}>
                                        {d}
                                    </SelectOption>
                                ))}
                            </Select>
                            <Input
                                type="text"
                                inputMode="numeric"
                                value={slot.start_time}
                                onChange={(e) => updateSlot(origIdx, 'start_time', parseTimeInput(e.target.value))}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="HH:MM"
                                className="w-20 text-[12px] shrink-0"
                                disabled={disabled}
                            />
                            <span className="text-sm text-muted-foreground shrink-0">—</span>
                            <Input
                                type="text"
                                inputMode="numeric"
                                value={slot.end_time}
                                onChange={(e) => updateSlot(origIdx, 'end_time', parseTimeInput(e.target.value))}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="HH:MM"
                                className="w-20 text-[12px] shrink-0"
                                disabled={disabled}
                            />
                            <Input
                                value={slot.slot_name}
                                onChange={(e) => updateSlot(origIdx, 'slot_name', e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                placeholder={t('form.labelPlaceholder', 'Label')}
                                className="flex-1 text-[12px] min-w-0"
                                disabled={disabled}
                            />
                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="checkbox"
                                    checked={slot.is_active}
                                    onChange={(e) => updateSlot(origIdx, 'is_active', e.target.checked)}
                                    className="h-3.5 w-3.5 cursor-pointer"
                                    disabled={disabled}
                                />
                                <button
                                    onClick={() => removeSlot(origIdx)}
                                    className="text-destructive hover:opacity-70 cursor-pointer flex items-center"
                                    disabled={disabled}
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Card>
    );

    if (compact) {
        return (
            <div className="space-y-4">
                {DetailsCard}
                {ScheduleCard}
                {SlotListCard}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>{DetailsCard}</div>
            <div className="lg:col-span-2 space-y-4">
                {ScheduleCard}
                {SlotListCard}
            </div>
        </div>
    );
}
