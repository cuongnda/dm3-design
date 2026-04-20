import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield } from 'lucide-react';
import {
    AppModal,
    Input,
    Label,
    Select,
    SelectOption,
    Checkbox,
    Textarea,
} from '@dm3/ui';
import { createRbacRole, updateRbacRole } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Role, Permission } from './types';

interface RoleModalProps {
    open: boolean;
    role: Role | null;
    permissions: Permission[];
    onOpenChange: (open: boolean) => void;
    onSaved: () => void;
}

interface FormState {
    name: string;
    description: string;
    status: 'active' | 'inactive';
    permissions: Set<string>;
}

const EMPTY_FORM: FormState = {
    name: '',
    description: '',
    status: 'active',
    permissions: new Set<string>(),
};

export function RoleModal({ open, role, permissions, onOpenChange, onSaved }: RoleModalProps) {
    const { t } = useTranslation('roles');
    const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, permissions: new Set() });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        if (role) {
            setForm({
                name: role.name,
                description: role.description ?? '',
                status: (role.status === 'inactive' ? 'inactive' : 'active'),
                permissions: new Set(role.permissions ?? []),
            });
        } else {
            setForm({ ...EMPTY_FORM, permissions: new Set() });
        }
        setError(null);
    }, [open, role]);

    // Group permissions by plugin, then by domain
    const grouped = useMemo(() => {
        const byPlugin: Record<string, Record<string, Permission[]>> = {};
        for (const p of permissions) {
            const pluginKey = p.plugin || 'core';
            const domainKey = p.domain || 'misc';
            byPlugin[pluginKey] = byPlugin[pluginKey] ?? {};
            byPlugin[pluginKey][domainKey] = byPlugin[pluginKey][domainKey] ?? [];
            byPlugin[pluginKey][domainKey].push(p);
        }
        return byPlugin;
    }, [permissions]);

    const togglePermission = (key: string) => {
        setForm((prev) => {
            const next = new Set(prev.permissions);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return { ...prev, permissions: next };
        });
    };

    const toggleDomain = (domainKey: string, items: Permission[]) => {
        setForm((prev) => {
            const next = new Set(prev.permissions);
            const allSelected = items.every((p) => next.has(p.key));
            if (allSelected) {
                for (const p of items) next.delete(p.key);
            } else {
                for (const p of items) next.add(p.key);
            }
            return { ...prev, permissions: next };
        });
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            setError(t('modal.nameRequired', 'Role name is required'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const payload = {
                name: form.name.trim(),
                description: form.description.trim() || undefined,
                permissions: Array.from(form.permissions),
                status: form.status,
            };
            if (role) {
                await updateRbacRole(role.id, payload);
                toast(t('toast.updated'), 'success');
            } else {
                await createRbacRole(payload);
                toast(t('toast.created'), 'success');
            }
            onSaved();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to save role';
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
                    <Shield size={16} />
                    {role ? t('modal.editTitle') : t('modal.addTitle')}
                </span>
            }
            size="xl"
            showCancelButton
            cancelLabel={t('modal.cancel')}
            cancelDisabled={saving}
            primaryAction={{
                label: saving ? t('modal.saving') : t('modal.save'),
                onClick: handleSave,
                disabled: saving,
                loading: saving,
            }}
        >
            <div className="space-y-4">
                {error && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label htmlFor="role-name">
                            {t('modal.name')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="role-name"
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder={t('modal.namePlaceholder', 'e.g. Site Manager')}
                            disabled={saving}
                            data-testid="role-input-name"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label>{t('modal.status')}</Label>
                        <Select
                            value={form.status}
                            onValueChange={(v) => setForm((prev) => ({ ...prev, status: v as 'active' | 'inactive' }))}
                        >
                            <SelectOption value="active">{t('status.active')}</SelectOption>
                            <SelectOption value="inactive">{t('status.inactive')}</SelectOption>
                        </Select>
                    </div>
                </div>

                <div className="space-y-1">
                    <Label htmlFor="role-description">{t('modal.description')}</Label>
                    <Textarea
                        id="role-description"
                        value={form.description}
                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                        placeholder={t('modal.descriptionPlaceholder', 'What this role is for…')}
                        rows={2}
                        disabled={saving}
                        data-testid="role-input-description"
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <Label>
                            {t('modal.permissions')}{' '}
                            <span className="text-[12px] text-muted-foreground">
                                ({form.permissions.size} {t('modal.selected', 'selected')})
                            </span>
                        </Label>
                    </div>

                    <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
                        {Object.keys(grouped).length === 0 ? (
                            <div className="py-6 text-center text-[13px] text-muted-foreground">
                                {t('modal.noPermissions', 'No permissions available')}
                            </div>
                        ) : (
                            Object.entries(grouped)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([plugin, domains]) => (
                                    <div key={plugin} className="space-y-2">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {t(`plugin.${plugin}`, plugin)}
                                        </div>
                                        {Object.entries(domains)
                                            .sort(([a], [b]) => a.localeCompare(b))
                                            .map(([domain, items]) => {
                                                const allSelected = items.every((p) => form.permissions.has(p.key));
                                                const someSelected = items.some((p) => form.permissions.has(p.key));
                                                return (
                                                    <div key={`${plugin}-${domain}`} className="rounded-md border border-border bg-card p-2.5">
                                                        <label className="mb-2 flex cursor-pointer items-center gap-2">
                                                            <Checkbox
                                                                checked={allSelected}
                                                                onCheckedChange={() => toggleDomain(`${plugin}-${domain}`, items)}
                                                                aria-label={`Select all ${domain}`}
                                                            />
                                                            <span className="text-[12px] font-medium capitalize">
                                                                {domain}
                                                            </span>
                                                            {someSelected && !allSelected && (
                                                                <span className="text-[11px] text-muted-foreground">
                                                                    ({items.filter((p) => form.permissions.has(p.key)).length}/{items.length})
                                                                </span>
                                                            )}
                                                        </label>
                                                        <div className="grid grid-cols-1 gap-1 pl-6 sm:grid-cols-2">
                                                            {items
                                                                .sort((a, b) => a.key.localeCompare(b.key))
                                                                .map((perm) => (
                                                                    <label
                                                                        key={perm.key}
                                                                        className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-muted"
                                                                        title={perm.description || perm.key}
                                                                    >
                                                                        <Checkbox
                                                                            checked={form.permissions.has(perm.key)}
                                                                            onCheckedChange={() => togglePermission(perm.key)}
                                                                            data-testid={`role-checkbox-permission-${perm.key}`}
                                                                        />
                                                                        <div className="flex min-w-0 flex-col">
                                                                            <span className="font-mono text-[11px] leading-tight">
                                                                                {perm.key}
                                                                            </span>
                                                                            {perm.description && (
                                                                                <span className="truncate text-[10.5px] text-muted-foreground">
                                                                                    {perm.description}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </label>
                                                                ))}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            </div>
        </AppModal>
    );
}
