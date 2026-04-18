import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock } from 'lucide-react';
import { AppModal } from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
    AccessTimeForm,
    emptyAccessTimeValues,
    validateAccessTimeValues,
    type AccessTimeFormValues,
} from './AccessTimeForm';

interface AccessTimeFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated?: () => void;
}

export function AccessTimeFormModal({ open, onOpenChange, onCreated }: AccessTimeFormModalProps) {
    const { t } = useTranslation('accessTimes');
    const [values, setValues] = useState<AccessTimeFormValues>(emptyAccessTimeValues);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) return;
        setValues(emptyAccessTimeValues);
        setSaving(false);
    }, [open]);

    const handleSubmit = async () => {
        const err = validateAccessTimeValues(values);
        if (err) {
            toast(err, 'error');
            return;
        }
        setSaving(true);
        try {
            await apiFetch('/api/v1/access/access-times', {
                method: 'POST',
                body: JSON.stringify({
                    name: values.name,
                    description: values.description || undefined,
                    timezone: values.timezone,
                    is_active: values.is_active,
                    time_slots: values.slots,
                }),
            });
            toast(t('toast.created', 'Access time created'), 'success');
            onCreated?.();
            onOpenChange(false);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to save access time';
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
                    <Clock size={16} className="text-primary" />
                    {t('form.title.new', 'New Access Time')}
                </span>
            }
            description={t(
                'form.description.new',
                'Define a schedule with weekly time slots that can be attached to access groups',
            )}
            size="4xl"
            showCancelButton
            cancelLabel={t('form.cancel', 'Cancel')}
            cancelDisabled={saving}
            submitDisabled={saving || !values.name.trim() || values.slots.length === 0}
            primaryAction={{
                label: saving ? t('form.saving', 'Saving...') : t('form.save', 'Save'),
                onClick: handleSubmit,
                loading: saving,
                'data-testid': 'access-time-button-submit',
            }}
        >
            <AccessTimeForm values={values} onChange={setValues} disabled={saving} />
        </AppModal>
    );
}
