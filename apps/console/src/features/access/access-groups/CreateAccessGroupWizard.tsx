import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, DoorOpen, Search, User as UserIcon } from 'lucide-react';
import {
    WizardModal,
    Button,
    Input,
    Label,
    Badge,
    Checkbox,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { AccessGroupFormData, AccessTime } from './types';
import { buildZonePathMap, ZonePathLabel, type ZoneRef } from '../shared/zone-path';

// ─── Types ────────────────────────────────────────────────────────────────

interface AvailableAP {
    id: string;
    name: string;
    description?: string;
    zone_id?: string | null;
}


interface AvailableUser {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string;
    position: string;
    department_name: string;
    status: string;
}

type Step = 1 | 2 | 3;

interface CreateAccessGroupWizardProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    accessTimes: AccessTime[];
    /** Called after the wizard finishes (success or skip) so the parent can refresh. */
    onCompleted: (createdId: string) => void;
}

// ─── Wizard ───────────────────────────────────────────────────────────────

export function CreateAccessGroupWizard({
    open,
    onOpenChange,
    accessTimes,
    onCompleted,
}: CreateAccessGroupWizardProps) {
    const { t } = useTranslation('accessGroups');

    const [step, setStep] = useState<Step>(1);
    const [submitting, setSubmitting] = useState(false);
    const [groupForm, setGroupForm] = useState<AccessGroupFormData>({ name: '', is_default: false });
    const [formError, setFormError] = useState('');
    const [createdId, setCreatedId] = useState<string | null>(null);
    // Track which steps were explicitly skipped so we can show a warning banner.
    const [skippedAPs, setSkippedAPs] = useState(false);
    const [skippedUsers, setSkippedUsers] = useState(false);

    // Step 2 (APs)
    const [aps, setAPs] = useState<AvailableAP[]>([]);
    const [zones, setZones] = useState<ZoneRef[]>([]);
    const [loadingAPs, setLoadingAPs] = useState(false);
    const [apSearch, setApSearch] = useState('');
    const [selectedAPs, setSelectedAPs] = useState<Set<string>>(new Set());

    // Step 3 (Users)
    const [users, setUsers] = useState<AvailableUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [userSearch, setUserSearch] = useState('');
    const [userDept, setUserDept] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

    // ── Reset when wizard opens/closes ──────────────────────────────────
    useEffect(() => {
        if (open) return;
        setStep(1);
        setSubmitting(false);
        setGroupForm({ name: '', is_default: false });
        setFormError('');
        setCreatedId(null);
        setSkippedAPs(false);
        setSkippedUsers(false);
        setAPs([]);
        setZones([]);
        setSelectedAPs(new Set());
        setApSearch('');
        setUsers([]);
        setSelectedUsers(new Set());
        setUserSearch('');
        setUserDept('');
    }, [open]);

    // ── Step 2 data fetch ───────────────────────────────────────────────
    useEffect(() => {
        if (!open || step !== 2 || aps.length > 0 || loadingAPs) return;
        setLoadingAPs(true);
        Promise.all([
            apiFetch<{ data?: AvailableAP[] }>('/api/v1/access/access-points?limit=500'),
            apiFetch<{ data?: ZoneRef[] }>('/api/v1/access/zones?limit=500'),
        ])
            .then(([apsRes, zonesRes]) => {
                setAPs(apsRes.data ?? []);
                setZones(zonesRes.data ?? []);
            })
            .catch(() => {
                setAPs([]);
                setZones([]);
            })
            .finally(() => setLoadingAPs(false));
    }, [open, step, aps.length, loadingAPs]);

    const zonePathById = useMemo(() => buildZonePathMap(zones), [zones]);

    // ── Step 3 data fetch ───────────────────────────────────────────────
    useEffect(() => {
        if (!open || step !== 3 || users.length > 0 || loadingUsers) return;
        setLoadingUsers(true);
        apiFetch<{ users?: AvailableUser[] }>('/api/v1/identity/users?limit=500&status=active')
            .then((res) => setUsers(res.users ?? []))
            .catch(() => setUsers([]))
            .finally(() => setLoadingUsers(false));
    }, [open, step, users.length, loadingUsers]);

    // ── Filtered lists ──────────────────────────────────────────────────
    const filteredAPs = useMemo(() => {
        const q = apSearch.trim().toLowerCase();
        if (!q) return aps;
        return aps.filter((ap) => {
            const zonePath = ap.zone_id ? (zonePathById.get(ap.zone_id) ?? '') : '';
            return (
                ap.name.toLowerCase().includes(q) ||
                (ap.description ?? '').toLowerCase().includes(q) ||
                zonePath.toLowerCase().includes(q)
            );
        });
    }, [aps, apSearch, zonePathById]);

    const departments = useMemo(
        () => [...new Set(users.map((u) => u.department_name).filter(Boolean))].sort(),
        [users],
    );

    const filteredUsers = useMemo(() => {
        const q = userSearch.trim().toLowerCase();
        return users.filter((u) => {
            if (userDept && u.department_name !== userDept) return false;
            if (!q) return true;
            return (
                u.full_name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q) ||
                (u.position ?? '').toLowerCase().includes(q)
            );
        });
    }, [users, userSearch, userDept]);

    // ── Handlers ────────────────────────────────────────────────────────

    const handleStep1Continue = async () => {
        if (!groupForm.name.trim()) {
            setFormError(t('validation.nameRequired', 'Name is required'));
            return;
        }
        setFormError('');
        setSubmitting(true);
        try {
            const res = await apiFetch<{ id?: string; data?: { id?: string } }>(
                '/api/v1/access/access-groups',
                { method: 'POST', body: JSON.stringify(groupForm) },
            );
            const id = res.id ?? res.data?.id;
            if (!id) {
                toast(t('toast.createFailed', 'Failed to create access group'), 'error');
                return;
            }
            setCreatedId(id);
            toast(t('toast.created', 'Access group created'), 'success');
            setStep(2);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create access group';
            toast(msg, 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const handleStep2Continue = async (skip: boolean) => {
        if (!createdId) return;
        if (skip || selectedAPs.size === 0) {
            setSkippedAPs(true);
        } else {
            setSkippedAPs(false);
            setSubmitting(true);
            try {
                for (const apId of selectedAPs) {
                    await apiFetch(`/api/v1/access/access-groups/${createdId}/access-points`, {
                        method: 'POST',
                        body: JSON.stringify({ access_point_id: apId }),
                    });
                }
                toast(
                    t('toast.accessPointsAdded', '{{count}} access point(s) added', {
                        count: selectedAPs.size,
                    }),
                    'success',
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to add access points';
                toast(msg, 'error');
            } finally {
                setSubmitting(false);
            }
        }
        setStep(3);
    };

    const handleStep3Finish = async (skip: boolean) => {
        if (!createdId) return;
        if (skip || selectedUsers.size === 0) {
            setSkippedUsers(true);
        } else {
            setSkippedUsers(false);
            setSubmitting(true);
            try {
                await apiFetch(`/api/v1/access/access-groups/${createdId}/users`, {
                    method: 'POST',
                    body: JSON.stringify([...selectedUsers].map((id) => ({ user_id: id }))),
                });
                toast(
                    t('toast.usersAdded', '{{count}} user(s) added', { count: selectedUsers.size }),
                    'success',
                );
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to add users';
                toast(msg, 'error');
            } finally {
                setSubmitting(false);
            }
        }
        const id = createdId;
        onCompleted(id);
        onOpenChange(false);
    };

    const handleClose = () => {
        // If group already created, user can safely close — it exists in list.
        onOpenChange(false);
        if (createdId) onCompleted(createdId);
    };

    // ── Rendering helpers ───────────────────────────────────────────────

    // Numbered stepper (1) INFO ── (2) WHERE ── (3) WHO — no icons so
    // WizardModal shows numeric badges.
    const steps = [
        { id: 1 as const, label: t('wizard.step1', 'INFO') },
        { id: 2 as const, label: t('wizard.step2', 'WHERE') },
        { id: 3 as const, label: t('wizard.step3', 'WHO') },
    ];

    // ── Step 1 body (info form) ─────────────────────────────────────────
    const Step1Body = (
        <div className="flex flex-col gap-3">
            <div>
                <Label htmlFor="wiz-name">
                    {t('form.name', 'Name')} <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="wiz-name"
                    data-testid="access-wizard-input-name"
                    value={groupForm.name}
                    onChange={(e) => {
                        setGroupForm((p) => ({ ...p, name: e.target.value }));
                        setFormError('');
                    }}
                    placeholder={t('form.namePlaceholder', 'Group name')}
                    disabled={submitting}
                />
                {formError && <p className="text-[12px] text-destructive mt-1">{formError}</p>}
            </div>
            <div>
                <Label htmlFor="wiz-desc">{t('form.description', 'Description')}</Label>
                <Input
                    id="wiz-desc"
                    data-testid="access-wizard-input-description"
                    value={groupForm.description ?? ''}
                    onChange={(e) =>
                        setGroupForm((p) => ({ ...p, description: e.target.value || undefined }))
                    }
                    placeholder={t('form.descriptionPlaceholder', 'Optional description')}
                    disabled={submitting}
                />
            </div>
            <div>
                <Label htmlFor="wiz-access-time">{t('form.accessTime', 'Access Time')}</Label>
                <select
                    id="wiz-access-time"
                    data-testid="access-wizard-select-accessTime"
                    value={groupForm.access_time_id ?? ''}
                    onChange={(e) =>
                        setGroupForm((p) => ({
                            ...p,
                            access_time_id: e.target.value || undefined,
                        }))
                    }
                    disabled={submitting}
                    className="w-full h-9 px-3 py-1 text-[13px] border border-border rounded-md bg-input text-foreground appearance-none cursor-pointer"
                >
                    <option value="">{t('form.noRestriction', 'No time restriction (24/7)')}</option>
                    {accessTimes.map((at) => (
                        <option key={at.id} value={at.id}>
                            {at.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="flex items-center gap-2">
                <input
                    id="wiz-is-default"
                    data-testid="access-wizard-input-isDefault"
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={!!groupForm.is_default}
                    onChange={(e) => setGroupForm((p) => ({ ...p, is_default: e.target.checked }))}
                    disabled={submitting}
                />
                <label
                    htmlFor="wiz-is-default"
                    className="text-[13px] text-foreground cursor-pointer select-none"
                >
                    {t('form.isDefault', 'Set as default group')}
                </label>
            </div>
            <p className="text-[12px] text-muted-foreground mt-2">
                {t(
                    'wizard.step1Hint',
                    'Next you can add access points and users. All steps after this are optional — you can manage them later.',
                )}
            </p>
        </div>
    );

    // ── Step 2 body (access points picker) ──────────────────────────────
    const toggleAP = (id: string) =>
        setSelectedAPs((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const toggleAllFilteredAPs = () => {
        const allSelected = filteredAPs.every((ap) => selectedAPs.has(ap.id));
        setSelectedAPs((prev) => {
            const next = new Set(prev);
            filteredAPs.forEach((ap) => (allSelected ? next.delete(ap.id) : next.add(ap.id)));
            return next;
        });
    };
    const Step2Body = (
        <div className="space-y-3">
            <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                    className="pl-8"
                    placeholder={t('searchAccessPoints', 'Search access points…')}
                    value={apSearch}
                    onChange={(e) => setApSearch(e.target.value)}
                    disabled={submitting}
                    data-testid="access-wizard-input-search-ap"
                />
            </div>
            <div className="rounded-md border border-border overflow-hidden max-h-[360px] overflow-y-auto">
                {loadingAPs ? (
                    <div className="flex justify-center py-10">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    </div>
                ) : filteredAPs.length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-muted-foreground">
                        {aps.length === 0
                            ? t('noAccessPointsInSystem', 'No access points found in the system.')
                            : t('noAPsMatch', 'No access points match your search.')}
                    </div>
                ) : (
                    <table className="w-full text-[13px]">
                        <thead className="bg-muted/60 border-b border-border sticky top-0">
                            <tr>
                                <th className="w-10 px-3 py-2 text-left">
                                    <Checkbox
                                        checked={filteredAPs.every((ap) => selectedAPs.has(ap.id))}
                                        onCheckedChange={toggleAllFilteredAPs}
                                        disabled={submitting || filteredAPs.length === 0}
                                    />
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                    {t('columns.accessPointName', 'Access Point')}
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                    {t('columns.zone', 'Zone')}
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                    {t('columns.description', 'Description')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAPs.map((ap) => {
                                const zonePath = ap.zone_id ? zonePathById.get(ap.zone_id) : undefined;
                                return (
                                    <tr
                                        key={ap.id}
                                        onClick={() => !submitting && toggleAP(ap.id)}
                                        className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                                    >
                                        <td className="w-10 px-3 py-2">
                                            <Checkbox
                                                checked={selectedAPs.has(ap.id)}
                                                onCheckedChange={() => toggleAP(ap.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                disabled={submitting}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <DoorOpen size={13} className="text-primary shrink-0" />
                                                <span className="font-medium">{ap.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            {zonePath ? (
                                                <ZonePathLabel path={zonePath} />
                                            ) : (
                                                <span className="text-muted-foreground/60">—</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-muted-foreground">
                                            {ap.description ?? '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            {selectedAPs.size > 0 && (
                <p className="text-[12px] text-muted-foreground">
                    {t('accessPointsSelected', {
                        defaultValue: '{{count}} access point(s) selected',
                        count: selectedAPs.size,
                    })}
                </p>
            )}
        </div>
    );

    // ── Step 3 body (users picker) ──────────────────────────────────────
    const toggleUser = (id: string) =>
        setSelectedUsers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    const toggleAllFilteredUsers = () => {
        const allSelected = filteredUsers.every((u) => selectedUsers.has(u.id));
        setSelectedUsers((prev) => {
            const next = new Set(prev);
            filteredUsers.forEach((u) => (allSelected ? next.delete(u.id) : next.add(u.id)));
            return next;
        });
    };
    const Step3Body = (
        <div className="space-y-3">
            {skippedAPs && (
                <div
                    className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-300"
                    data-testid="access-wizard-warning-step2-skipped"
                >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                        {t(
                            'wizard.incompleteStep2',
                            'No access points assigned — members of this group will not be able to enter anywhere until you add some later.',
                        )}
                    </span>
                </div>
            )}
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder={t('searchUsers', 'Search users…')}
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        disabled={submitting}
                        data-testid="access-wizard-input-search-user"
                    />
                </div>
                {departments.length > 0 && (
                    <select
                        value={userDept}
                        onChange={(e) => setUserDept(e.target.value)}
                        disabled={submitting}
                        className="h-9 px-3 py-1 text-[13px] border border-border rounded-md bg-input text-foreground min-w-[160px]"
                    >
                        <option value="">{t('allDepartments', 'All departments')}</option>
                        {departments.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            <div className="rounded-md border border-border overflow-hidden max-h-[360px] overflow-y-auto">
                {loadingUsers ? (
                    <div className="flex justify-center py-10">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="py-10 text-center text-[13px] text-muted-foreground">
                        {users.length === 0
                            ? t('noUsersInSystem', 'No active users found.')
                            : t('noUsersMatch', 'No users match your filters.')}
                    </div>
                ) : (
                    <table className="w-full text-[13px]">
                        <thead className="bg-muted/60 border-b border-border sticky top-0">
                            <tr>
                                <th className="w-10 px-3 py-2 text-left">
                                    <Checkbox
                                        checked={filteredUsers.every((u) => selectedUsers.has(u.id))}
                                        onCheckedChange={toggleAllFilteredUsers}
                                        disabled={submitting || filteredUsers.length === 0}
                                    />
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                    {t('columns.name', 'Name')}
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                    {t('columns.email', 'Email')}
                                </th>
                                <th className="px-3 py-2 text-left font-medium text-foreground">
                                    {t('columns.department', 'Department')}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((u) => (
                                <tr
                                    key={u.id}
                                    onClick={() => !submitting && toggleUser(u.id)}
                                    className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                                >
                                    <td className="w-10 px-3 py-2">
                                        <Checkbox
                                            checked={selectedUsers.has(u.id)}
                                            onCheckedChange={() => toggleUser(u.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={submitting}
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                            <UserIcon size={13} className="text-primary shrink-0" />
                                            <span className="font-medium">{u.full_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                                    <td className="px-3 py-2 text-muted-foreground">
                                        {u.department_name ? (
                                            <Badge variant="secondary" className="text-[10px]">
                                                {u.department_name}
                                            </Badge>
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {selectedUsers.size > 0 && (
                <p className="text-[12px] text-muted-foreground">
                    {t('usersSelected', {
                        defaultValue: '{{count}} user(s) selected',
                        count: selectedUsers.size,
                    })}
                </p>
            )}
        </div>
    );

    // ── Footer (per step) ───────────────────────────────────────────────
    const Footer = (
        <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={handleClose} disabled={submitting}>
                {createdId ? t('close', 'Close') : t('cancel', 'Cancel')}
            </Button>
            <div className="flex gap-2">
                {step === 1 && (
                    <Button
                        onClick={handleStep1Continue}
                        disabled={submitting || !groupForm.name.trim()}
                        data-testid="access-wizard-button-step1-continue"
                    >
                        {submitting
                            ? t('creating', 'Creating...')
                            : t('wizard.createAndContinue', 'Create & Continue')}
                    </Button>
                )}
                {step === 2 && (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => handleStep2Continue(true)}
                            disabled={submitting}
                            data-testid="access-wizard-button-step2-skip"
                            title={t(
                                'wizard.skipStep2Hint',
                                'Skip adding access points — the group will have no entry access until you add some later.',
                            )}
                        >
                            {t('wizard.skip', 'Skip')}
                        </Button>
                        <Button
                            onClick={() => handleStep2Continue(false)}
                            disabled={submitting || selectedAPs.size === 0}
                            data-testid="access-wizard-button-step2-continue"
                        >
                            {submitting
                                ? t('adding', 'Adding...')
                                : t('wizard.addAndContinue', {
                                      defaultValue: 'Add {{count}} & Continue',
                                      count: selectedAPs.size,
                                  })}
                        </Button>
                    </>
                )}
                {step === 3 && (
                    <>
                        <Button
                            variant="outline"
                            onClick={() => handleStep3Finish(true)}
                            disabled={submitting}
                            data-testid="access-wizard-button-step3-skip"
                            title={t(
                                'wizard.skipStep3Hint',
                                'Skip adding users — the group will have no members. Assign users later from User Management or the group detail page.',
                            )}
                        >
                            {t('wizard.skip', 'Skip')}
                        </Button>
                        <Button
                            onClick={() => handleStep3Finish(false)}
                            disabled={submitting || selectedUsers.size === 0}
                            data-testid="access-wizard-button-step3-finish"
                        >
                            {submitting
                                ? t('adding', 'Adding...')
                                : t('wizard.addAndFinish', {
                                      defaultValue: 'Add {{count}} & Finish',
                                      count: selectedUsers.size,
                                  })}
                        </Button>
                    </>
                )}
            </div>
        </div>
    );

    return (
        <WizardModal
            open={open}
            onOpenChange={(v) => {
                if (!v) handleClose();
                else onOpenChange(true);
            }}
            title={
                <span className="flex items-center gap-2">
                    <Shield size={16} className="text-primary" />
                    {t('wizard.title', 'New Access Group')}
                </span>
            }
            size="xl"
            steps={steps}
            activeStep={step}
            footer={Footer}
        >
            {step === 1 && Step1Body}
            {step === 2 && Step2Body}
            {step === 3 && Step3Body}
        </WizardModal>
    );
}
