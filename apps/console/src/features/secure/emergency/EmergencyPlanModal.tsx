import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Button, Input, Label, Select, SelectOption, Badge, Checkbox, WizardModal,
} from '@dm3/ui';
import { cn } from '@/lib/utils';
import {
    Flame, Lock, Unlock, HeartPulse, UserX, ShieldAlert,
    DoorOpen, Zap, AlertTriangle, ChevronRight, ChevronDown, MapPin,
    Palette, Target, AlertCircle,
} from 'lucide-react';
import {
    fetchEmergencyPlan, createEmergencyPlan, updateEmergencyPlan,
    fetchZones, fetchAccessPoints,
    type ZoneDTO, type AccessPointDTO,
} from '@/lib/api';
import { toast } from '@/lib/toast';

interface EmergencyPlanModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    planId?: string | null;
    onSaved?: () => void;
}

const iconMap: Record<string, React.ReactNode> = {
    flame: <Flame size={20} />, lock: <Lock size={20} />, unlock: <Unlock size={20} />,
    'heart-pulse': <HeartPulse size={20} />, 'user-x': <UserX size={20} />,
    'shield-alert': <ShieldAlert size={20} />, 'door-open': <DoorOpen size={20} />,
    zap: <Zap size={20} />, 'alert-triangle': <AlertTriangle size={20} />,
};

const ICON_OPTIONS = Object.keys(iconMap);
const ACTION_OPTIONS = [
    { value: 'hold_open', label: 'Hold Open (stay open until release)' },
    { value: 'hold_close', label: 'Hold Close (lockdown until release)' },
];

type StepId = 'identity' | 'action' | 'targets';

const DEFAULT_FORM = {
    name: '',
    description: '',
    icon: 'shield-alert',
    color: '#EF4444',
    action: 'hold_open',
    countdown_seconds: 5,
    enabled: true,
};

export function EmergencyPlanModal({ open, onOpenChange, planId, onSaved }: EmergencyPlanModalProps) {
    const { t } = useTranslation('secure');
    const isEdit = !!planId;

    const [step, setStep] = useState<StepId>('identity');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [zones, setZones] = useState<ZoneDTO[]>([]);
    const [accessPoints, setAccessPoints] = useState<AccessPointDTO[]>([]);
    const [form, setForm] = useState(DEFAULT_FORM);
    const [selectedAPIds, setSelectedAPIds] = useState<Set<string>>(new Set());

    const steps = useMemo(
        () => [
            { id: 'identity' as const, label: t('emergency.form.stepIdentity', { defaultValue: 'Identity' }), icon: Palette },
            { id: 'action' as const, label: t('emergency.form.stepAction', { defaultValue: 'Action' }), icon: Zap },
            { id: 'targets' as const, label: t('emergency.form.stepTargets', { defaultValue: 'Targets' }), icon: Target },
        ],
        [t]
    );

    useEffect(() => {
        if (!open) {
            setStep('identity');
            setForm(DEFAULT_FORM);
            setSelectedAPIds(new Set());
            setError('');
            setSaving(false);
            return;
        }

        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const [zoneData, apRes] = await Promise.all([
                    fetchZones(),
                    fetchAccessPoints(1, 500),
                ]);
                setZones(zoneData);
                const aps = apRes.data || [];
                setAccessPoints(aps);

                if (isEdit && planId) {
                    const plan = await fetchEmergencyPlan(planId);
                    if (plan) {
                        setForm({
                            name: plan.name,
                            description: plan.description,
                            icon: plan.icon,
                            color: plan.color,
                            action: plan.action,
                            countdown_seconds: plan.countdown_seconds,
                            enabled: plan.enabled,
                        });
                        if (plan.target_type === 'all') {
                            setSelectedAPIds(new Set(aps.map((ap) => ap.id)));
                        } else if (plan.target_type === 'access_point') {
                            setSelectedAPIds(new Set(plan.target_ids));
                        } else if (plan.target_type === 'zone') {
                            const apIds = aps
                                .filter((ap) => ap.zone_id && plan.target_ids.includes(ap.zone_id))
                                .map((ap) => ap.id);
                            setSelectedAPIds(new Set(apIds));
                        }
                    }
                } else {
                    setForm(DEFAULT_FORM);
                    setSelectedAPIds(new Set());
                }
            } catch {
                setError(t('emergency.toast.loadFailed', { defaultValue: 'Failed to load data' }));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [open, planId, isEdit, t]);

    const tree = useMemo(() => {
        const zoneMap = new Map(zones.map((z) => [z.id, z]));
        const groups: { zone: ZoneDTO | null; aps: AccessPointDTO[] }[] = [];
        const byZone = new Map<string, AccessPointDTO[]>();
        const noZone: AccessPointDTO[] = [];

        for (const ap of accessPoints) {
            if (ap.zone_id) {
                const list = byZone.get(ap.zone_id) || [];
                list.push(ap);
                byZone.set(ap.zone_id, list);
            } else {
                noZone.push(ap);
            }
        }

        for (const [zoneId, aps] of byZone) {
            groups.push({ zone: zoneMap.get(zoneId) ?? { id: zoneId, name: zoneId, tenant_id: '' }, aps });
        }
        if (noZone.length > 0) groups.push({ zone: null, aps: noZone });
        return groups;
    }, [zones, accessPoints]);

    const toggleAP = (apId: string) => {
        setSelectedAPIds((prev) => {
            const next = new Set(prev);
            if (next.has(apId)) next.delete(apId);
            else next.add(apId);
            return next;
        });
    };
    const toggleZone = (zoneAPs: AccessPointDTO[]) => {
        const ids = zoneAPs.map((ap) => ap.id);
        const allSelected = ids.every((id) => selectedAPIds.has(id));
        setSelectedAPIds((prev) => {
            const next = new Set(prev);
            if (allSelected) ids.forEach((id) => next.delete(id));
            else ids.forEach((id) => next.add(id));
            return next;
        });
    };
    const selectAll = () => {
        if (selectedAPIds.size === accessPoints.length) setSelectedAPIds(new Set());
        else setSelectedAPIds(new Set(accessPoints.map((ap) => ap.id)));
    };

    const identityValid = form.name.trim().length > 0;
    const targetsValid = selectedAPIds.size > 0;

    const handleSave = async () => {
        if (!identityValid) {
            setStep('identity');
            setError(t('emergency.toast.nameRequired', { defaultValue: 'Name is required' }));
            return;
        }
        if (!targetsValid) {
            setStep('targets');
            setError(t('emergency.toast.selectAP', { defaultValue: 'Select at least one access point' }));
            return;
        }

        setSaving(true);
        setError('');
        try {
            const isAll = selectedAPIds.size === accessPoints.length;
            const data = {
                name: form.name.trim(),
                description: form.description,
                icon: form.icon,
                color: form.color,
                action: form.action,
                target_type: isAll ? 'all' : 'access_point',
                target_ids: isAll ? [] : Array.from(selectedAPIds),
                countdown_seconds: form.countdown_seconds,
                enabled: form.enabled,
            };

            if (isEdit && planId) {
                await updateEmergencyPlan(planId, data);
                toast(t('emergency.toast.planUpdated', { defaultValue: 'Plan updated' }), 'success');
            } else {
                await createEmergencyPlan(data);
                toast(t('emergency.toast.planCreated', { defaultValue: 'Plan created' }), 'success');
            }
            onSaved?.();
            onOpenChange(false);
        } catch {
            setError(t('emergency.toast.planSaveFailed', { defaultValue: 'Failed to save plan' }));
        } finally {
            setSaving(false);
        }
    };

    const goNext = () => {
        if (step === 'identity') {
            if (!identityValid) {
                setError(t('emergency.toast.nameRequired', { defaultValue: 'Name is required' }));
                return;
            }
            setError('');
            setStep('action');
        } else if (step === 'action') {
            setStep('targets');
        }
    };
    const goBack = () => {
        if (step === 'targets') setStep('action');
        else if (step === 'action') setStep('identity');
    };

    const footer = (
        <div className="flex items-center justify-between gap-2 border-t border-border px-6 py-4">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={saving}
                data-testid="emergency-button-cancel"
            >
                {t('emergency.form.cancel', { defaultValue: 'Cancel' })}
            </Button>
            <div className="flex items-center gap-2">
                {step !== 'identity' && (
                    <Button variant="outline" size="sm" onClick={goBack} disabled={saving} data-testid="emergency-button-back">
                        {t('emergency.form.back', { defaultValue: 'Back' })}
                    </Button>
                )}
                {step !== 'targets' ? (
                    <Button
                        size="sm"
                        onClick={goNext}
                        disabled={step === 'identity' && !identityValid}
                        data-testid="emergency-button-next"
                    >
                        {t('emergency.form.next', { defaultValue: 'Next' })}
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={!identityValid || !targetsValid || saving}
                        loading={saving}
                        data-testid="emergency-button-save"
                    >
                        {saving
                            ? t('emergency.form.saving', { defaultValue: 'Saving…' })
                            : isEdit
                                ? t('emergency.form.update', { defaultValue: 'Update Plan' })
                                : t('emergency.form.create', { defaultValue: 'Create Plan' })}
                    </Button>
                )}
            </div>
        </div>
    );

    return (
        <WizardModal
            open={open}
            onOpenChange={onOpenChange}
            title={
                <span className="flex items-center gap-2">
                    <ShieldAlert size={16} className="text-error" />
                    {isEdit
                        ? t('emergency.form.titleEdit', { defaultValue: 'Edit Emergency Plan' })
                        : t('emergency.form.titleNew', { defaultValue: 'New Emergency Plan' })}
                </span>
            }
            description={t('emergency.form.description', {
                defaultValue: 'Configure quick-activate emergency action with target access points',
            })}
            size="2xl"
            steps={steps}
            activeStep={step}
            footer={footer}
        >
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-5 h-5 border-2 border-secure/30 border-t-secure rounded-full animate-spin" />
                </div>
            ) : (
                <>
                    {error && (
                        <div
                            data-testid="emergency-text-error"
                            className="mb-4 px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px] flex items-center gap-2"
                        >
                            <AlertCircle size={16} />
                            {error}
                        </div>
                    )}

                    {step === 'identity' && (
                        <div className="grid grid-cols-[1fr_220px] gap-6">
                            <div className="space-y-4">
                                <div>
                                    <Label>{t('emergency.form.name', { defaultValue: 'Name' })} *</Label>
                                    <Input
                                        data-testid="emergency-input-name"
                                        value={form.name}
                                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                        placeholder="e.g. Fire Evacuation"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <Label>{t('emergency.form.description', { defaultValue: 'Description' })}</Label>
                                    <Input
                                        data-testid="emergency-input-description"
                                        value={form.description}
                                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                        placeholder="Optional"
                                    />
                                </div>
                                <div>
                                    <Label>{t('emergency.form.icon', { defaultValue: 'Icon' })}</Label>
                                    <div className="flex flex-wrap gap-2 mt-1">
                                        {ICON_OPTIONS.map((ic) => (
                                            <button
                                                key={ic}
                                                type="button"
                                                onClick={() => setForm((f) => ({ ...f, icon: ic }))}
                                                className={cn(
                                                    'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                                                    form.icon === ic
                                                        ? 'border-primary bg-primary/10'
                                                        : 'border-border hover:border-muted-foreground'
                                                )}
                                                style={form.icon === ic ? { color: form.color } : undefined}
                                            >
                                                {iconMap[ic]}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <Label>{t('emergency.form.color', { defaultValue: 'Color' })}</Label>
                                    <div className="flex items-center gap-2 mt-1">
                                        <input
                                            data-testid="emergency-input-color"
                                            type="color"
                                            value={form.color}
                                            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                                            className="h-9 w-12 rounded border border-border cursor-pointer"
                                        />
                                        <Input
                                            value={form.color}
                                            onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                                            className="flex-1 font-mono text-[12px]"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div
                                className="self-start rounded-xl border-2 p-4 text-center"
                                style={{ backgroundColor: `${form.color}08`, borderColor: `${form.color}40` }}
                            >
                                <div
                                    className="flex h-14 w-14 mx-auto items-center justify-center rounded-full"
                                    style={{ backgroundColor: `${form.color}15`, color: form.color }}
                                >
                                    {iconMap[form.icon] || <ShieldAlert size={20} />}
                                </div>
                                <div className="text-[14px] font-bold mt-2" style={{ color: form.color }}>
                                    {form.name || 'Plan Name'}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-1">Preview</div>
                            </div>
                        </div>
                    )}

                    {step === 'action' && (
                        <div className="space-y-4 max-w-md">
                            <div>
                                <Label>{t('emergency.form.action', { defaultValue: 'Action' })}</Label>
                                <Select
                                    data-testid="emergency-select-action"
                                    value={form.action}
                                    onValueChange={(v) => setForm((f) => ({ ...f, action: v }))}
                                >
                                    {ACTION_OPTIONS.map((a) => (
                                        <SelectOption key={a.value} value={a.value}>
                                            {a.label}
                                        </SelectOption>
                                    ))}
                                </Select>
                            </div>
                            <div>
                                <Label>{t('emergency.form.countdown', { defaultValue: 'Countdown (seconds)' })}</Label>
                                <Input
                                    data-testid="emergency-input-countdown"
                                    type="number"
                                    min={0}
                                    max={60}
                                    value={form.countdown_seconds}
                                    onChange={(e) =>
                                        setForm((f) => ({ ...f, countdown_seconds: Number(e.target.value) }))
                                    }
                                />
                                <p className="text-[11px] text-muted-foreground mt-1">
                                    Delay before the action is executed after activation.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                                <Checkbox
                                    data-testid="emergency-checkbox-enabled"
                                    id="plan-enabled"
                                    checked={form.enabled}
                                    onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: !!v }))}
                                />
                                <Label htmlFor="plan-enabled">
                                    {t('emergency.form.enabled', { defaultValue: 'Enabled' })}
                                </Label>
                            </div>
                        </div>
                    )}

                    {step === 'targets' && (
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <Label className="text-[14px] font-semibold">
                                    {t('emergency.form.targetAccessPoints', { defaultValue: 'Target Access Points' })}
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-[11px]">
                                        {selectedAPIds.size} / {accessPoints.length} selected
                                    </Badge>
                                    <Button variant="outline" size="sm" className="text-[12px]" onClick={selectAll}>
                                        {selectedAPIds.size === accessPoints.length
                                            ? t('emergency.form.deselectAll', { defaultValue: 'Deselect all' })
                                            : t('emergency.form.selectAll', { defaultValue: 'Select all' })}
                                    </Button>
                                </div>
                            </div>
                            <div className="rounded-lg border border-border bg-card overflow-auto max-h-[460px]">
                                {tree.map((group) => (
                                    <ZoneGroup
                                        key={group.zone?.id ?? '__no_zone__'}
                                        zone={group.zone}
                                        noZoneLabel={t('emergency.form.noZone', { defaultValue: 'No zone' })}
                                        accessPoints={group.aps}
                                        selectedIds={selectedAPIds}
                                        onToggleAP={toggleAP}
                                        onToggleZone={() => toggleZone(group.aps)}
                                    />
                                ))}
                                {tree.length === 0 && (
                                    <p className="py-8 text-center text-[13px] text-muted-foreground">
                                        {t('emergency.form.noAccessPoints', { defaultValue: 'No access points' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </WizardModal>
    );
}

function ZoneGroup({
    zone, noZoneLabel, accessPoints, selectedIds, onToggleAP, onToggleZone,
}: {
    zone: { id: string; name: string } | null;
    noZoneLabel: string;
    accessPoints: AccessPointDTO[];
    selectedIds: Set<string>;
    onToggleAP: (id: string) => void;
    onToggleZone: () => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const allSelected = accessPoints.every((ap) => selectedIds.has(ap.id));
    const someSelected = accessPoints.some((ap) => selectedIds.has(ap.id));

    return (
        <div className="border-b border-border last:border-b-0">
            <div
                className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 cursor-pointer hover:bg-muted/50"
                onClick={() => setExpanded((e) => !e)}
            >
                {expanded ? (
                    <ChevronDown size={14} className="text-muted-foreground" />
                ) : (
                    <ChevronRight size={14} className="text-muted-foreground" />
                )}
                <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={() => onToggleZone()}
                    onClick={(e) => e.stopPropagation()}
                />
                <MapPin size={13} className="text-muted-foreground" />
                <span className="text-[13px] font-medium text-foreground">{zone?.name ?? noZoneLabel}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                    {accessPoints.length}
                </Badge>
            </div>
            {expanded && (
                <div>
                    {accessPoints.map((ap) => (
                        <label
                            key={ap.id}
                            className="flex items-center gap-3 px-3 py-2 pl-10 cursor-pointer hover:bg-muted/20 transition-colors"
                        >
                            <Checkbox
                                checked={selectedIds.has(ap.id)}
                                onCheckedChange={() => onToggleAP(ap.id)}
                            />
                            <div className="min-w-0 flex-1">
                                <span className="text-[13px] text-foreground">{ap.name}</span>
                                {ap.description && (
                                    <span className="block text-[11px] text-muted-foreground truncate">
                                        {ap.description}
                                    </span>
                                )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                                {ap.access_device_count} devices
                            </span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
