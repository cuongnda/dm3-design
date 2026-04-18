import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import {
    AppModal,
    Input,
    Label,
    Select,
    SelectOption,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';

interface Department {
    id: string;
    name: string;
}

interface CreateUserModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: () => void;
}

interface CreateUserFormState {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    department_id: string;
    position: string;
    status: string;
}

const emptyForm: CreateUserFormState = {
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    department_id: '',
    position: '',
    status: 'active',
};

export function CreateUserModal({ open, onOpenChange, onCreated }: CreateUserModalProps) {
    const { t } = useTranslation('users');
    const navigate = useNavigate();

    const [form, setForm] = useState<CreateUserFormState>(emptyForm);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) {
            setForm(emptyForm);
            setSaving(false);
            return;
        }
        apiFetch<{ departments: Department[] }>('/api/v1/identity/departments?limit=200')
            .then((d) => setDepartments(d.departments ?? []))
            .catch(() => setDepartments([]));
    }, [open]);

    const update = <K extends keyof CreateUserFormState>(
        field: K,
        value: CreateUserFormState[K],
    ) => setForm((prev) => ({ ...prev, [field]: value }));

    const canSubmit =
        !!form.first_name.trim() && !!form.last_name.trim() && !!form.email.trim();

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSaving(true);
        try {
            const payload: Record<string, unknown> = {
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                email: form.email.trim(),
                status: form.status,
            };
            if (form.phone.trim()) payload.phone = form.phone.trim();
            if (form.position.trim()) payload.position = form.position.trim();
            if (form.department_id) payload.department_id = form.department_id;

            const created = await apiFetch<{ id: string }>('/api/v1/identity/users', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            toast(t('toast.created', 'User created'), 'success');
            onCreated?.();
            onOpenChange(false);
            if (created?.id) navigate(`/manage/users/${created.id}`);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : t('toast.saveFailed', 'Failed to save');
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
                    <UserPlus size={16} className="text-primary" />
                    {t('detail.newUser', 'New User')}
                </span>
            }
            description={t(
                'create.description',
                'Create a user now and complete their profile, credentials, and access groups afterwards.',
            )}
            size="2xl"
            showCancelButton
            cancelLabel={t('actions.cancel', 'Cancel')}
            cancelDisabled={saving}
            submitDisabled={!canSubmit || saving}
            primaryAction={{
                label: saving
                    ? t('actions.creating', 'Creating…')
                    : t('actions.create', 'Create user'),
                onClick: handleSubmit,
                loading: saving,
                'data-testid': 'user-button-submit',
            }}
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="user-modal-first-name" className="text-[12px]">
                            {t('modal.firstName', 'First Name')}{' '}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="user-modal-first-name"
                            data-testid="user-input-first-name"
                            value={form.first_name}
                            onChange={(e) => update('first_name', e.target.value)}
                            disabled={saving}
                            autoFocus
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="user-modal-last-name" className="text-[12px]">
                            {t('modal.lastName', 'Last Name')}{' '}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="user-modal-last-name"
                            data-testid="user-input-last-name"
                            value={form.last_name}
                            onChange={(e) => update('last_name', e.target.value)}
                            disabled={saving}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label htmlFor="user-modal-email" className="text-[12px]">
                            {t('modal.email', 'Email')}{' '}
                            <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            id="user-modal-email"
                            data-testid="user-input-email"
                            type="email"
                            value={form.email}
                            onChange={(e) => update('email', e.target.value)}
                            disabled={saving}
                        />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="user-modal-phone" className="text-[12px]">
                            {t('modal.phone', 'Phone')}
                        </Label>
                        <Input
                            id="user-modal-phone"
                            data-testid="user-input-phone"
                            value={form.phone}
                            onChange={(e) => update('phone', e.target.value)}
                            disabled={saving}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <Label className="text-[12px]">
                            {t('modal.department', 'Department')}
                        </Label>
                        <Select
                            value={form.department_id}
                            onValueChange={(v) => update('department_id', v)}
                            disabled={saving}
                            data-testid="user-select-department-id"
                        >
                            <SelectOption value="">
                                {t('modal.departmentNone', 'None')}
                            </SelectOption>
                            {departments.map((d) => (
                                <SelectOption key={d.id} value={d.id}>
                                    {d.name}
                                </SelectOption>
                            ))}
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="user-modal-position" className="text-[12px]">
                            {t('modal.position', 'Position')}
                        </Label>
                        <Input
                            id="user-modal-position"
                            data-testid="user-input-position-form"
                            value={form.position}
                            onChange={(e) => update('position', e.target.value)}
                            disabled={saving}
                        />
                    </div>
                </div>

                <div className="space-y-1">
                    <Label className="text-[12px]">{t('modal.status', 'Status')}</Label>
                    <Select
                        value={form.status}
                        onValueChange={(v) => update('status', v)}
                        disabled={saving}
                        data-testid="user-input-status"
                    >
                        <SelectOption value="active">
                            {t('status.active', 'Active')}
                        </SelectOption>
                        <SelectOption value="inactive">
                            {t('status.inactive', 'Inactive')}
                        </SelectOption>
                        <SelectOption value="suspended">
                            {t('status.suspended', 'Suspended')}
                        </SelectOption>
                    </Select>
                </div>
            </div>
        </AppModal>
    );
}
