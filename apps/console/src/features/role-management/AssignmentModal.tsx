import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { AppModal, Label, Select, SelectOption, Input } from '@dm3/ui';
import {
    apiFetch,
    createRbacAssignment,
    listRbacEligibleAccounts,
    fetchZones,
    type RbacEligibleAccountDTO,
    type ZoneDTO,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Role, ScopeType } from './types';
import { SCOPE_TYPES } from './types';

interface AssignmentModalProps {
    open: boolean;
    role: Role;
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

interface Department {
    id: string;
    name: string;
}

interface FormState {
    account_id: string;
    scope_type: ScopeType;
    scope_id: string;
    effective_from: string;
    effective_to: string;
}

const EMPTY_FORM: FormState = {
    account_id: '',
    scope_type: 'company',
    scope_id: '',
    effective_from: '',
    effective_to: '',
};

export function AssignmentModal({ open, role, onOpenChange, onSaved }: AssignmentModalProps) {
    const { t } = useTranslation('roles');
    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
    const [accounts, setAccounts] = useState<RbacEligibleAccountDTO[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [zones, setZones] = useState<ZoneDTO[]>([]);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setForm({ ...EMPTY_FORM });
        setError(null);
        listRbacEligibleAccounts()
            .then((a) => setAccounts(a))
            .catch(() => setAccounts([]));
        apiFetch<{ departments: Department[] }>('/api/v1/identity/departments?limit=200')
            .then((d) => setDepartments(d.departments || []))
            .catch(() => setDepartments([]));
        fetchZones()
            .then((z) => setZones(z))
            .catch(() => setZones([]));
    }, [open]);

    const needsScopeId = form.scope_type === 'department' || form.scope_type === 'zone';

    const handleSave = async () => {
        if (!form.account_id) {
            setError(t('assignment.accountRequired', 'Please select an account'));
            return;
        }
        if (needsScopeId && !form.scope_id) {
            setError(t('assignment.scopeIdRequired', 'Please select a scope target'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await createRbacAssignment({
                account_id: form.account_id,
                role_id: role.id,
                scope_type: form.scope_type,
                scope_id: needsScopeId ? form.scope_id : null,
                effective_from: form.effective_from || null,
                effective_to: form.effective_to || null,
            });
            toast(t('assignment.toast.created', 'Assignment created'), 'success');
            onSaved();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create assignment';
            setError(message);
            toast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <AppModal
            open={open}
            onOpenChange={onOpenChange}
            title={
                <span className="flex items-center gap-2">
                    <UserPlus size={16} />
                    {t('assignment.addTitle', 'Assign Role')}
                </span>
            }
            size="md"
            showCancelButton
            cancelLabel={t('modal.cancel')}
            cancelDisabled={saving}
            primaryAction={{
                label: saving ? t('modal.saving') : t('assignment.submit', 'Assign'),
                onClick: handleSave,
                disabled: saving,
                loading: saving,
            }}
        >
            <div className="space-y-3">
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                        {error}
                    </div>
                )}

                <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[12px]">
                    <span className="text-muted-foreground">{t('assignment.roleLabel', 'Role')}: </span>
                    <span className="font-medium">{role.name}</span>
                </div>

                <div className="space-y-1">
                    <Label>
                        {t('assignment.account', 'Account')} <span className="text-destructive">*</span>
                    </Label>
                    <Select
                        value={form.account_id}
                        onValueChange={(v) => setForm((prev) => ({ ...prev, account_id: v }))}
                    >
                        <SelectOption value="">{t('assignment.accountPlaceholder', '— Select an account —')}</SelectOption>
                        {accounts.map((a) => (
                            <SelectOption key={a.id} value={a.id}>
                                {a.full_name || a.email} ({a.email})
                            </SelectOption>
                        ))}
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                        {t(
                            'assignment.accountHint',
                            'Only users with login accounts appear here. To give someone a role, create their login account in User Management first.',
                        )}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label>
                            {t('assignment.scopeType', 'Scope Type')} <span className="text-destructive">*</span>
                        </Label>
                        <Select
                            value={form.scope_type}
                            onValueChange={(v) =>
                                setForm((prev) => ({ ...prev, scope_type: v as ScopeType, scope_id: '' }))
                            }
                        >
                            {SCOPE_TYPES.map((s) => (
                                <SelectOption key={s} value={s}>
                                    {t(`assignment.scope.${s}`, s)}
                                </SelectOption>
                            ))}
                        </Select>
                    </div>
                    {needsScopeId && (
                        <div className="space-y-1">
                            <Label>
                                {t('assignment.scopeTarget', 'Target')} <span className="text-destructive">*</span>
                            </Label>
                            <Select
                                value={form.scope_id}
                                onValueChange={(v) => setForm((prev) => ({ ...prev, scope_id: v }))}
                            >
                                <SelectOption value="">—</SelectOption>
                                {form.scope_type === 'department' &&
                                    departments.map((d) => (
                                        <SelectOption key={d.id} value={d.id}>
                                            {d.name}
                                        </SelectOption>
                                    ))}
                                {form.scope_type === 'zone' &&
                                    zones.map((z) => (
                                        <SelectOption key={z.id} value={z.id}>
                                            {z.name}
                                        </SelectOption>
                                    ))}
                            </Select>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="effective_from">{t('assignment.effectiveFrom', 'Effective From')}</Label>
                        <Input
                            id="effective_from"
                            type="date"
                            value={form.effective_from}
                            onChange={(e) => setForm((prev) => ({ ...prev, effective_from: e.target.value }))}
                            disabled={saving}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="effective_to">{t('assignment.effectiveTo', 'Effective To')}</Label>
                        <Input
                            id="effective_to"
                            type="date"
                            value={form.effective_to}
                            onChange={(e) => setForm((prev) => ({ ...prev, effective_to: e.target.value }))}
                            disabled={saving}
                        />
                    </div>
                </div>
            </div>
        </AppModal>
    );
}
