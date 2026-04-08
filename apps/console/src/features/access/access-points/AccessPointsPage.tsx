import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Search, MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react';
import {
    Button,
    Input,
    Badge,
    AppModal,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Select,
    SelectOption,
    Label,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessPoints } from './hooks/useAccessPoints';
import type { AccessPoint, AccessPointFormData, Zone } from './types';

// ---------------------------------------------------------------------------
// Inline modal for create / edit
// ---------------------------------------------------------------------------

interface AccessPointModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    initial?: AccessPoint;
    zones: Zone[];
    onSubmit: (data: AccessPointFormData) => Promise<boolean>;
}

function AccessPointModal({ open, onOpenChange, title, initial, zones, onSubmit }: AccessPointModalProps) {
    const { t } = useTranslation('accessPoints');
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState<AccessPointFormData>({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        zone_id: initial?.zone_id ?? '',
    });
    const [nameError, setNameError] = useState('');

    // Reset form when modal opens with new initial data
    const handleOpenChange = (v: boolean) => {
        if (v) {
            setForm({
                name: initial?.name ?? '',
                description: initial?.description ?? '',
                zone_id: initial?.zone_id ?? '',
            });
            setNameError('');
        }
        onOpenChange(v);
    };

    const handleSubmit = async () => {
        if (!form.name.trim()) {
            setNameError(t('validation.nameRequired', 'Name is required'));
            return;
        }
        setSubmitting(true);
        const payload: AccessPointFormData = {
            name: form.name.trim(),
            ...(form.description?.trim() && { description: form.description.trim() }),
            ...(form.zone_id && { zone_id: form.zone_id }),
        };
        const ok = await onSubmit(payload);
        setSubmitting(false);
        if (ok) onOpenChange(false);
    };

    const set = (field: keyof AccessPointFormData, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        if (field === 'name') setNameError('');
    };

    return (
        <AppModal
            open={open}
            onOpenChange={handleOpenChange}
            title={title}
            size="sm"
            showCancelButton
            cancelLabel={t('cancel', 'Cancel')}
            primaryAction={{
                label: submitting ? t('saving', 'Saving…') : t('save', 'Save'),
                onClick: handleSubmit,
                disabled: submitting,
            }}
        >
            <div className="space-y-4">
                {/* Name */}
                <div>
                    <Label htmlFor="ap-name">{t('name', 'Name')} *</Label>
                    <Input
                        id="ap-name"
                        value={form.name}
                        onChange={(e) => set('name', e.target.value)}
                        placeholder={t('namePlaceholder', 'e.g. Main Entrance')}
                        className={nameError ? 'border-destructive' : ''}
                        disabled={submitting}
                    />
                    {nameError && <p className="mt-1 text-[11px] text-destructive">{nameError}</p>}
                </div>

                {/* Description */}
                <div>
                    <Label htmlFor="ap-description">{t('description', 'Description')}</Label>
                    <Input
                        id="ap-description"
                        value={form.description ?? ''}
                        onChange={(e) => set('description', e.target.value)}
                        placeholder={t('descriptionPlaceholder', 'Optional description')}
                        disabled={submitting}
                    />
                </div>

                {/* Zone */}
                <div>
                    <Label>{t('zone', 'Zone')}</Label>
                    <Select
                        value={form.zone_id ?? ''}
                        onValueChange={(v) => set('zone_id', v)}
                        placeholder={t('noZone', '— No zone —')}
                        disabled={submitting}
                    >
                        <SelectOption value="">{t('noZone', '— No zone —')}</SelectOption>
                        {zones.map((z) => (
                            <SelectOption key={z.id} value={z.id}>
                                {z.name}
                            </SelectOption>
                        ))}
                    </Select>
                </div>
            </div>
        </AppModal>
    );
}

// ---------------------------------------------------------------------------
// AccessPointsPage
// ---------------------------------------------------------------------------

export function AccessPointsPage() {
    const { t } = useTranslation('accessPoints');
    const navigate = useNavigate();

    const {
        accessPoints,
        zones,
        loading,
        filters,
        fetchAccessPoints,
        createAccessPoint,
        updateAccessPoint,
        updateFilters,
    } = useAccessPoints();

    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingAP, setEditingAP] = useState<AccessPoint | null>(null);
    const [deletingAP, setDeletingAP] = useState<AccessPoint | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const zoneMap = useMemo(() => new Map(zones.map((z) => [z.id, z.name])), [zones]);

    const handleCreate = async (data: AccessPointFormData) => createAccessPoint(data);

    const handleEdit = async (data: AccessPointFormData) => {
        if (!editingAP) return false;
        return updateAccessPoint(editingAP.id, data);
    };

    const handleDeleteConfirm = async () => {
        if (!deletingAP) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await apiFetch(`/api/v1/access/access-points/${deletingAP.id}`, { method: 'DELETE' });
            setDeletingAP(null);
            fetchAccessPoints();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete access point';
            try {
                const j = JSON.parse(msg.replace(/^API \d+: /, ''));
                setDeleteError(j.message || j.error || msg);
            } catch {
                setDeleteError(msg.replace(/^API \d+: /, ''));
            }
        } finally {
            setDeleteLoading(false);
        }
    };

    // Calculate summary stats
    const stats = useMemo(() => {
        const filtered = accessPoints.filter((ap) => {
            if (filters.search) {
                const q = filters.search.toLowerCase();
                if (!ap.name.toLowerCase().includes(q) && !(ap.description && ap.description.toLowerCase().includes(q))) {
                    return false;
                }
            }
            if (filters.zone_id && ap.zone_id !== filters.zone_id) return false;
            return true;
        });
        return {
            total: accessPoints.length,
            filtered: filtered.length,
            withDevices: accessPoints.filter((ap) => (ap.access_device_count ?? 0) > 0).length,
        };
    }, [accessPoints, filters]);

    // Filter access points
    const filteredAPs = useMemo(() => {
        let result = accessPoints;
        if (filters.search) {
            const q = filters.search.toLowerCase();
            result = result.filter((ap) =>
                ap.name.toLowerCase().includes(q) ||
                (ap.description && ap.description.toLowerCase().includes(q))
            );
        }
        if (filters.zone_id) {
            result = result.filter((ap) => ap.zone_id === filters.zone_id);
        }
        return result;
    }, [accessPoints, filters]);

    return (
        <div className="space-y-6 overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">{t('title', 'Access Points')}</h1>
                    <p className="text-muted-foreground">{t('description', 'Manage physical access points and their device assignments')}</p>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus size={16} className="mr-2" />
                    {t('newAccessPoint', 'New Access Point')}
                </Button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                                <Shield size={20} className="text-primary" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-primary">{stats.total}</div>
                                <div className="text-sm text-muted-foreground">{t('stats.total', 'Total')}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                                <Shield size={20} className="text-green-600" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-green-600">{stats.withDevices}</div>
                                <div className="text-sm text-muted-foreground">{t('stats.assigned', 'With Devices')}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                                <Shield size={20} className="text-purple-600" />
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-purple-600">{stats.filtered}</div>
                                <div className="text-sm text-muted-foreground">{t('stats.filtered', 'Filtered')}</div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Search & Filter */}
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="text"
                    placeholder={t('searchPlaceholder', 'Search by name or description…')}
                    value={filters.search}
                    onChange={(e) => updateFilters({ search: e.target.value })}
                    className="pl-10"
                />
            </div>

            {/* Zone Filter */}
            {zones.length > 0 && (
                <Select value={filters.zone_id} onValueChange={(v) => updateFilters({ zone_id: v })} placeholder={t('allZones', 'All Zones')}>
                    <SelectOption value="">{t('allZones', 'All Zones')}</SelectOption>
                    {zones.map((z) => (
                        <SelectOption key={z.id} value={z.id}>
                            {z.name}
                        </SelectOption>
                    ))}
                </Select>
            )}

            {/* Grid of Cards */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                </div>
            ) : filteredAPs.length === 0 ? (
                <Card>
                    <CardContent className="text-center py-12">
                        <Shield size={48} className="mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">{t('noAccessPoints', 'No access points found')}</h3>
                        <p className="text-muted-foreground">
                            {filters.search || filters.zone_id
                                ? t('noResults', 'No access points match your filters')
                                : t('empty', 'No access points yet. Add the first one.')}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAPs.map((ap) => (
                        <Card key={ap.id} className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-3 flex-1">
                                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                            <Shield size={20} className="text-primary" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <CardTitle className="text-base truncate">{ap.name}</CardTitle>
                                            {ap.description && (
                                                <p className="text-sm text-muted-foreground truncate">{ap.description}</p>
                                            )}
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <Button variant="ghost" size="sm" className="shrink-0">
                                                <MoreHorizontal size={16} />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => navigate(`/access/access-points/${ap.id}`)}>
                                                <Eye size={14} className="mr-2" />
                                                {t('view', 'View')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setEditingAP(ap)}>
                                                <Edit size={14} className="mr-2" />
                                                {t('edit', 'Edit')}
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setDeletingAP(ap)} className="text-destructive">
                                                <Trash2 size={14} className="mr-2" />
                                                {t('delete', 'Delete')}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-3">
                                    {ap.zone_id && zoneMap.get(ap.zone_id) && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-muted-foreground">{t('zone', 'Zone')}</span>
                                            <Badge variant="outline">{zoneMap.get(ap.zone_id)}</Badge>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm text-muted-foreground">{t('devices', 'Devices')}</span>
                                        <Badge variant="secondary">{ap.access_device_count ?? 0}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-muted-foreground pt-2 border-t border-border">
                                        <span>{t('created', 'Created')}</span>
                                        <span>{new Date(ap.created_at).toLocaleDateString()}</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create modal */}
            <AccessPointModal
                open={showCreateModal}
                onOpenChange={setShowCreateModal}
                title={t('createTitle', 'New Access Point')}
                zones={zones}
                onSubmit={handleCreate}
            />

            {/* Edit modal */}
            {editingAP && (
                <AccessPointModal
                    open={!!editingAP}
                    onOpenChange={(v) => {
                        if (!v) setEditingAP(null);
                    }}
                    title={t('editTitle', 'Edit Access Point')}
                    initial={editingAP}
                    zones={zones}
                    onSubmit={handleEdit}
                />
            )}

            {/* Delete confirmation */}
            <AppModal
                open={!!deletingAP}
                onOpenChange={(v) => {
                    if (!v) {
                        setDeletingAP(null);
                        setDeleteError(null);
                    }
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('deleteTitle', 'Delete Access Point')}
                    </span>
                }
                size="xs"
                style={{ maxWidth: '22rem' }}
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                cancelDisabled={deleteLoading}
                errorMessage={deleteError ?? undefined}
                primaryAction={{
                    label: deleteLoading ? t('deleting', 'Deleting…') : t('delete', 'Delete'),
                    variant: 'destructive',
                    onClick: handleDeleteConfirm,
                    loading: deleteLoading,
                    disabled: deleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('deleteConfirm', 'Are you sure you want to delete')} <span className="font-medium text-foreground">"{deletingAP?.name}"</span>?
                </p>
            </AppModal>
        </div>
    );
}
