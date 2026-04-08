import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Trash2, Plus } from 'lucide-react';
import { Button, Input, AppModal, Select, SelectOption, Card, Label } from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import type { SlotInput, AccessTime } from './types';

type DaySlot = { start: string; end: string };

const DAYS = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
];

const TIMEZONES = [
    { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (UTC+7)' },
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
    { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
];

const PRESETS: Record<string, Record<number, DaySlot[]>> = {
    'Standard Working Hours': {
        1: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
        2: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
        3: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
        4: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
        5: [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }],
    },
    '24/7 Access': Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [i, [{ start: '00:00', end: '23:59' }]])
    ),
};

function timeToMin(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
}

export function AccessTimeFormPage() {
    const { t } = useTranslation('accessTimes');
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isNew = !id || id === 'new';

    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
    const [isActive, setIsActive] = useState(true);
    const [slots, setSlots] = useState<Record<number, DaySlot[]>>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // Load existing access time
    useEffect(() => {
        if (isNew) return;
        setLoading(true);
        apiFetch<any>(`/api/v1/access/access-times/${id}`)
            .then((data) => {
                const at: AccessTime = data.access_time ?? data;
                setName(at.name);
                setDescription(at.description ?? '');
                setTimezone(at.timezone);
                setIsActive(at.is_active);

                const grouped: Record<number, DaySlot[]> = {};
                (at.slots || []).forEach((slot: SlotInput) => {
                    if (!grouped[slot.day_of_week]) grouped[slot.day_of_week] = [];
                    grouped[slot.day_of_week].push({
                        start: slot.start_time.substring(0, 5),
                        end: slot.end_time.substring(0, 5),
                    });
                });
                setSlots(grouped);
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
            .finally(() => setLoading(false));
    }, [id, isNew]);

    const handleApplyPreset = (presetName: string) => {
        const preset = PRESETS[presetName];
        if (preset) {
            setSlots(JSON.parse(JSON.stringify(preset)));
            if (!name) setName(presetName);
        }
    };

    const handleAddSlot = (dayOfWeek: number) => {
        setSlots((prev) => ({
            ...prev,
            [dayOfWeek]: [...(prev[dayOfWeek] || []), { start: '08:00', end: '17:00' }],
        }));
    };

    const handleRemoveSlot = (dayOfWeek: number, index: number) => {
        setSlots((prev) => ({
            ...prev,
            [dayOfWeek]: prev[dayOfWeek].filter((_, i) => i !== index),
        }));
    };

    const handleUpdateSlot = (dayOfWeek: number, index: number, field: 'start' | 'end', value: string) => {
        setSlots((prev) => ({
            ...prev,
            [dayOfWeek]: prev[dayOfWeek].map((s, i) =>
                i === index ? { ...s, [field]: value } : s
            ),
        }));
    };

    const handleSave = async () => {
        if (!name.trim()) {
            setError(t('form.nameRequired', 'Name is required'));
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const slotInputs: SlotInput[] = [];
            Object.entries(slots).forEach(([dayStr, daySlots]) => {
                const dayOfWeek = parseInt(dayStr, 10);
                daySlots.forEach((slot) => {
                    slotInputs.push({
                        day_of_week: dayOfWeek,
                        start_time: slot.start + ':00',
                        end_time: slot.end + ':00',
                        is_active: true,
                    });
                });
            });

            if (isNew) {
                const createPayload = {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    timezone,
                    time_slots: slotInputs,
                };
                await apiFetch('/api/v1/access/access-times', {
                    method: 'POST',
                    body: JSON.stringify(createPayload),
                });
            } else {
                const updatePayload = {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    timezone,
                    is_active: isActive,
                    time_slots: slotInputs,
                };
                await apiFetch(`/api/v1/access/access-times/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatePayload),
                });
            }
            navigate('/access/access-times');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (isNew) return;
        try {
            await apiFetch(`/api/v1/access/access-times/${id}`, { method: 'DELETE' });
            navigate('/access/access-times');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        } finally {
            setShowDeleteDialog(false);
        }
    };

    if (loading) {
        return <div className="text-center py-8">Loading...</div>;
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">
                        {isNew ? t('form.title.new', 'New Access Time') : t('form.title.edit', 'Edit Access Time')}
                    </h1>
                </div>
                <Button variant="outline" size="sm" onClick={() => navigate('/access/access-times')}>
                    <ArrowLeft size={14} className="mr-1.5" />
                    {t('back', 'Back')}
                </Button>
            </div>

            {error && (
                <div className="shrink-0 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                    <p className="text-[13px] text-destructive">{error}</p>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pr-4">
                {/* Left: Details */}
                <Card className="p-4 space-y-3 lg:col-span-1">
                    <div>
                        <Label>{t('form.name', 'Name')} *</Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t('form.namePlaceholder', 'e.g. Business Hours')}
                            className="h-8 text-[13px]"
                        />
                    </div>
                    <div>
                        <Label>{t('form.description', 'Description')}</Label>
                        <Input
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder={t('form.descriptionPlaceholder', 'Optional')}
                            className="h-8 text-[13px]"
                        />
                    </div>
                    <div>
                        <Label>{t('form.timezone', 'Timezone')} *</Label>
                        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-8 text-[12px]">
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
                            id="is-active"
                            checked={isActive}
                            onChange={(e) => setIsActive(e.target.checked)}
                            className="h-4 w-4"
                        />
                        <Label htmlFor="is-active">{t('form.active', 'Active')}</Label>
                    </div>
                    <div className="border-t pt-3">
                        <Label>{t('form.presets', 'Presets')}</Label>
                        <div className="space-y-1 mt-2">
                            {Object.keys(PRESETS).map((p) => (
                                <Button
                                    key={p}
                                    variant="outline"
                                    size="sm"
                                    className="w-full justify-start text-xs"
                                    onClick={() => handleApplyPreset(p)}
                                >
                                    {p}
                                </Button>
                            ))}
                        </div>
                    </div>
                </Card>

                {/* Right: Time Slots */}
                <div className="lg:col-span-2 space-y-3">
                    {DAYS.map((day) => (
                        <Card key={day.value} className="p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-[13px] font-medium">{day.label}</h3>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-xs"
                                    onClick={() => handleAddSlot(day.value)}
                                >
                                    <Plus size={12} className="mr-1" />
                                    {t('form.addSlot', 'Add')}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {slots[day.value]?.map((slot, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <Input
                                            type="time"
                                            value={slot.start}
                                            onChange={(e) => handleUpdateSlot(day.value, idx, 'start', e.target.value)}
                                            className="h-8 text-[12px] flex-1"
                                        />
                                        <span className="text-[12px] text-muted-foreground">to</span>
                                        <Input
                                            type="time"
                                            value={slot.end}
                                            onChange={(e) => handleUpdateSlot(day.value, idx, 'end', e.target.value)}
                                            className="h-8 text-[12px] flex-1"
                                        />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            onClick={() => handleRemoveSlot(day.value, idx)}
                                        >
                                            <Trash2 size={14} />
                                        </Button>
                                    </div>
                                )) || (
                                    <p className="text-[12px] text-muted-foreground">{t('form.noSlots', 'No time slots')}</p>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
            </div>

            {/* Actions */}
            <div className="shrink-0 flex gap-2 justify-between">
                <div>
                    {!isNew && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setShowDeleteDialog(true)}
                        >
                            <Trash2 size={14} className="mr-1.5" />
                            {t('delete', 'Delete')}
                        </Button>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/access/access-times')}>
                        {t('cancel', 'Cancel')}
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                        {saving ? t('saving', 'Saving...') : t('save', 'Save')}
                    </Button>
                </div>
            </div>

            {/* Delete Confirmation */}
            <AppModal
                open={showDeleteDialog}
                onOpenChange={setShowDeleteDialog}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('deleteTitle', 'Delete Access Time')}
                    </span>
                }
                size="xs"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: t('delete', 'Delete'),
                    variant: 'destructive',
                    onClick: handleDelete,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('deleteConfirm', 'Are you sure you want to delete')} <span className="font-medium">"{name}"</span>?
                </p>
            </AppModal>
        </div>
    );
}
