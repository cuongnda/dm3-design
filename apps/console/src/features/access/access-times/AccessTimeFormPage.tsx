import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
    AccessTimeForm,
    emptyAccessTimeValues,
    validateAccessTimeValues,
    type AccessTimeFormValues,
} from './AccessTimeForm';

interface AccessTimeApi {
    name: string;
    description?: string;
    timezone: string;
    is_active: boolean;
    slots?: Array<{
        day_of_week: number;
        start_time: string;
        end_time: string;
        slot_name?: string;
        is_active: boolean;
    }>;
}

export function AccessTimeFormPage() {
    const { t } = useTranslation('accessTimes');
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    const [values, setValues] = useState<AccessTimeFormValues>(emptyAccessTimeValues);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!id || id === 'new') return;
        setLoading(true);
        apiFetch<{ access_time?: AccessTimeApi } & AccessTimeApi>(
            `/api/v1/access/access-times/${id}`,
        )
            .then((data) => {
                const at = data.access_time ?? data;
                setValues({
                    name: at.name,
                    description: at.description || '',
                    timezone: at.timezone,
                    is_active: at.is_active,
                    slots: (at.slots || []).map((s) => ({
                        day_of_week: s.day_of_week,
                        start_time: s.start_time.substring(0, 5),
                        end_time: s.end_time.substring(0, 5),
                        slot_name: s.slot_name || '',
                        is_active: s.is_active,
                    })),
                });
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    const handleSave = async () => {
        const err = validateAccessTimeValues(values);
        if (err) {
            toast(err, 'error');
            return;
        }
        setSaving(true);
        try {
            await apiFetch(`/api/v1/access/access-times/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: values.name,
                    description: values.description || undefined,
                    timezone: values.timezone,
                    is_active: values.is_active,
                    time_slots: values.slots,
                }),
            });
            toast(t('toast.updated'), 'success');
            navigate('/access/access-times');
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to save access time';
            toast(message, 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between">
                <h1 className="text-[18px] font-semibold text-foreground">
                    {t('form.title.edit', 'Edit Access Time')}
                </h1>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/access/access-times')}
                >
                    <ArrowLeft className="w-4 h-4 mr-1" /> {t('back', 'Back')}
                </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto pr-4">
                <AccessTimeForm values={values} onChange={setValues} disabled={saving} />
            </div>

            <div className="shrink-0 flex justify-end gap-2">
                <Button variant="outline" onClick={() => navigate('/access/access-times')}>
                    {t('form.cancel', 'Cancel')}
                </Button>
                <Button
                    onClick={handleSave}
                    disabled={saving || !values.name.trim() || values.slots.length === 0}
                >
                    {saving ? t('form.saving', 'Saving...') : t('form.save', 'Save')}
                </Button>
            </div>
        </div>
    );
}
