import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Edit, Trash2, Trash } from 'lucide-react';
import {
    Button,
    Input,
    Badge,
    AppModal,
    DataTable,
    type Column,
    Select,
    SelectOption,
    Label,
    Card,
    TablePaginationFooter,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useZones } from './hooks/useZones';
import type { Zone, ZoneFormData } from './types';

interface ZoneFormState {
    name: string;
    description: string;
    parent_id: string;
}

const emptyForm: ZoneFormState = {
    name: '',
    description: '',
    parent_id: '',
};

function zoneFormToData(form: ZoneFormState): ZoneFormData {
    return {
        name: form.name,
        description: form.description || undefined,
        parent_id: form.parent_id || undefined,
    };
}

export function ZonesPage() {
    const { t } = useTranslation('zones');

    const { zones, loading, pagination, sortBy, sortDir, fetchZones, createZone, updateZone, changePage, changePageSize, changeSort } = useZones();

    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingZone, setEditingZone] = useState<Zone | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [zoneToDelete, setZoneToDelete] = useState<Zone | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [formData, setFormData] = useState<ZoneFormState>(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

    const filteredZones = useMemo(() => {
        if (!search.trim()) return zones;
        const q = search.toLowerCase();
        return zones.filter((z) => z.name.toLowerCase().includes(q) || (z.description ?? '').toLowerCase().includes(q));
    }, [zones, search]);

    const openCreate = () => {
        setFormData(emptyForm);
        setFormErrors({});
        setShowCreateModal(true);
    };

    const openEdit = (zone: Zone) => {
        setFormData({
            name: zone.name,
            description: zone.description ?? '',
            parent_id: zone.parent_id ?? '',
        });
        setFormErrors({});
        setEditingZone(zone);
    };

    const openDelete = (zone: Zone) => {
        setZoneToDelete(zone);
        setDeleteError(null);
        setShowDeleteDialog(true);
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.name.trim()) {
            errors.name = t('validation.nameRequired', 'Name is required');
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreateSubmit = async () => {
        if (!validateForm()) return;
        setSubmitting(true);
        const success = await createZone(zoneFormToData(formData));
        setSubmitting(false);
        if (success) setShowCreateModal(false);
    };

    const handleEditSubmit = async () => {
        if (!editingZone || !validateForm()) return;
        setSubmitting(true);
        const success = await updateZone(editingZone.id, zoneFormToData(formData));
        setSubmitting(false);
        if (success) setEditingZone(null);
    };

    const handleDeleteConfirm = async () => {
        if (!zoneToDelete) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await apiFetch(`/api/v1/access/zones/${zoneToDelete.id}`, { method: 'DELETE' });
            setShowDeleteDialog(false);
            setZoneToDelete(null);
            fetchZones();
            toast(t('toast.deleted'), 'success');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete zone';
            try {
                const j = JSON.parse(msg.replace(/^API \d+: /, ''));
                setDeleteError(j.message || j.error || msg);
            } catch {
                setDeleteError(msg.replace(/^API \d+: /, ''));
            }
            toast(msg, 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleBulkDeleteConfirm = async () => {
        setBulkDeleteLoading(true);
        try {
            await apiFetch('/api/v1/access/zones/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
            toast(t('toast.bulkDeleted', { count: selected.length }), 'success');
            setSelected([]);
            setShowBulkDeleteDialog(false);
            fetchZones();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk delete failed';
            setDeleteError(message);
            toast(message, 'error');
        } finally {
            setBulkDeleteLoading(false);
        }
    };

    const handleFieldChange = (field: keyof ZoneFormState, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (formErrors[field]) {
            setFormErrors((prev) => ({ ...prev, [field]: '' }));
        }
    };

    const columns = useMemo(
        (): Column<Zone>[] => [
            {
                key: 'name',
                header: t('columns.name', 'Name'),
                sortable: true,
                render: (z) => {
                    const parentName = z.parent_id ? zones.find((p) => p.id === z.parent_id)?.name : undefined;
                    return (
                        <div className="flex items-center gap-2">
                            <MapPin size={14} className="text-primary shrink-0" />
                            <div>
                                <div className="text-[13px] font-medium">{z.name}</div>
                                {parentName && (
                                    <div className="text-[11px] text-muted-foreground">
                                        {t('parentLabel', 'Parent')}: {parentName}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                },
            },
            {
                key: 'description',
                header: t('columns.description', 'Description'),
                sortable: true,
                render: (z) =>
                    z.description ? (
                        <span className="text-[13px] text-muted-foreground truncate max-w-[240px] block">{z.description}</span>
                    ) : (
                        <span className="text-[13px] text-muted-foreground">—</span>
                    ),
            },
            {
                key: 'access_point_count',
                header: t('columns.accessPoints', 'Access Points'),
                width: '120px',
                sortable: true,
                render: (z) => <Badge variant="secondary">{z.access_point_count}</Badge>,
            },
            {
                key: 'created_at',
                header: t('columns.createdAt', 'Created'),
                width: '100px',
                sortable: true,
                render: (z) => <span className="text-[12px] text-muted-foreground">{new Date(z.created_at).toLocaleDateString()}</span>,
            },
            {
                key: 'actions',
                header: t('common:table.actions'),
                width: '72px',
                render: (z) => (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(z)}>
                            <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="text-destructive" onClick={() => openDelete(z)}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ),
            },
        ],
        [t, zones],
    );

    const zoneForm = (
        <div className="space-y-4">
            <div>
                <Label htmlFor="zone-name">{t('form.name', 'Name')} *</Label>
                <Input
                    id="zone-name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder={t('form.namePlaceholder', 'Zone name')}
                    className={formErrors.name ? 'border-destructive' : ''}
                    disabled={submitting}
                />
                {formErrors.name && <p className="text-sm text-destructive mt-1">{formErrors.name}</p>}
            </div>

            <div>
                <Label htmlFor="zone-description">{t('form.description', 'Description')}</Label>
                <Input
                    id="zone-description"
                    value={formData.description}
                    onChange={(e) => handleFieldChange('description', e.target.value)}
                    placeholder={t('form.descriptionPlaceholder', 'Optional description')}
                    disabled={submitting}
                />
            </div>

            <div>
                <Label>{t('form.parentZone', 'Parent Zone')}</Label>
                <Select
                    value={formData.parent_id}
                    onValueChange={(value) => handleFieldChange('parent_id', value)}
                    placeholder={t('form.noParent', 'No parent (top-level)')}
                    disabled={submitting}
                >
                    <SelectOption value="">{t('form.noParent', 'No parent (top-level)')}</SelectOption>
                    {zones
                        .filter((z) => !editingZone || z.id !== editingZone.id)
                        .map((z) => (
                            <SelectOption key={z.id} value={z.id}>
                                {z.name}
                            </SelectOption>
                        ))}
                </Select>
            </div>
        </div>
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header & Stats */}
            <div className="shrink-0 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Zones')}</h1>
                        <p className="text-[13px] text-muted-foreground">{t('description', 'Manage physical zones and access areas')}</p>
                    </div>
                    <Button size="sm" onClick={openCreate}>
                        <Plus size={14} className="mr-1.5" />
                        {t('addZone', 'Add Zone')}
                    </Button>
                </div>

                {/* Stats */}
                {!loading && (
                    <div className="grid grid-cols-3 gap-3">
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{pagination.total}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.total', 'Total')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{zones.filter((z) => !z.parent_id).length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.root', 'Root Zones')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{zones.filter((z) => !!z.parent_id).length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.sub', 'Sub-Zones')}</div>
                        </Card>
                    </div>
                )}

                {/* Search */}
                <Input
                    placeholder={t('searchPlaceholder', 'Search zones...')}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-8 text-[13px]"
                />
            </div>

            {/* Table */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
                <div className="min-h-0 flex-1 overflow-auto">
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        loading={loading}
                        columns={columns}
                        data={filteredZones}
                        sortState={{ col: sortBy, dir: sortDir }}
                        onSortChange={changeSort}
                        rowKey={(z) => z.id}
                        onRowDoubleClick={(z) => openEdit(z)}
                        emptyMessage={search ? t('noResults', 'No zones match your search') : t('empty', 'No zones yet. Add the first one.')}
                        emptyIcon={<MapPin size={32} strokeWidth={1.2} />}
                        selection={{
                            selectedIds: selected,
                            onSelectedIdsChange: setSelected,
                            selectAllScope: 'page',
                            selectOnRowClick: true,
                            bulkActions: [
                                {
                                    icon: <Trash size={13} className="text-destructive" />,
                                    label: t('common:table.deleteSelected'),
                                    variant: 'ghost',
                                    className: 'text-destructive hover:text-destructive hover:bg-destructive/10',
                                    onClick: () => setShowBulkDeleteDialog(true),
                                },
                            ],
                        }}
                    />
                </div>
                <TablePaginationFooter
                    page={pagination.page}
                    pageSize={pagination.limit}
                    total={pagination.total}
                    totalPages={pagination.total_pages}
                    pageSizeOptions={[10, 20, 50, 100]}
                    onPageChange={changePage}
                    onPageSizeChange={changePageSize}
                    loading={loading}
                    sortColumns={[
                        { value: 'name', label: t('columns.name', 'Name') },
                        { value: 'description', label: t('columns.description', 'Description') },
                        { value: 'access_point_count', label: t('columns.accessPoints', 'Access Points') },
                        { value: 'created_at', label: t('columns.createdAt', 'Created') },
                    ]}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={changeSort}
                />
            </div>

            {/* Create Modal */}
            <AppModal
                open={showCreateModal}
                onOpenChange={setShowCreateModal}
                title={
                    <span className="flex items-center gap-2">
                        <MapPin size={16} />
                        {t('createZone', 'Create Zone')}
                    </span>
                }
                size="sm"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: submitting ? t('saving', 'Saving...') : t('save', 'Save'),
                    onClick: handleCreateSubmit,
                    disabled: submitting,
                    loading: submitting,
                }}
            >
                {zoneForm}
            </AppModal>

            {/* Edit Modal */}
            <AppModal
                open={!!editingZone}
                onOpenChange={(open) => {
                    if (!open) setEditingZone(null);
                }}
                title={
                    <span className="flex items-center gap-2">
                        <MapPin size={16} />
                        {t('editZone', 'Edit Zone')}
                    </span>
                }
                size="sm"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: submitting ? t('saving', 'Saving...') : t('save', 'Save'),
                    onClick: handleEditSubmit,
                    disabled: submitting,
                    loading: submitting,
                }}
            >
                {zoneForm}
            </AppModal>

            {/* Delete Confirmation */}
            <AppModal
                open={showDeleteDialog}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowDeleteDialog(false);
                        setZoneToDelete(null);
                        setDeleteError(null);
                    }
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('deleteZone', 'Delete Zone')}
                    </span>
                }
                size="xs"
                style={{ maxWidth: '22rem' }}
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                cancelDisabled={deleteLoading}
                errorMessage={deleteError ?? undefined}
                primaryAction={{
                    label: deleteLoading ? t('deleting', 'Deleting...') : t('delete', 'Delete'),
                    variant: 'destructive',
                    onClick: handleDeleteConfirm,
                    loading: deleteLoading,
                    disabled: deleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('deleteConfirm', 'Are you sure you want to delete')}{' '}
                    <span className="font-medium text-foreground">"{zoneToDelete?.name}"</span>?
                    {(zoneToDelete?.access_point_count ?? 0) > 0 && (
                        <span className="block mt-2 text-destructive">
                            ⚠ {t('deleteWarning', 'This zone has')} {zoneToDelete?.access_point_count}{' '}
                            {t('deleteWarningPoints', 'access points assigned.')}
                        </span>
                    )}
                </p>
            </AppModal>

            {/* Bulk delete confirmation */}
            <AppModal
                open={showBulkDeleteDialog}
                onOpenChange={(open) => { if (!open) setShowBulkDeleteDialog(false); }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('bulkDeleteTitle', 'Delete Zones')}
                    </span>
                }
                size="xs"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                cancelDisabled={bulkDeleteLoading}
                primaryAction={{
                    label: bulkDeleteLoading ? t('deleting', 'Deleting...') : t('delete', 'Delete'),
                    variant: 'outline',
                    className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
                    onClick: handleBulkDeleteConfirm,
                    loading: bulkDeleteLoading,
                    disabled: bulkDeleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('bulkDeleteConfirm', 'Are you sure you want to delete')}{' '}
                    <span className="font-medium text-foreground">{selected.length}</span>{' '}
                    {t('bulkDeleteSuffix', 'zones? This cannot be undone.')}
                </p>
            </AppModal>
        </div>
    );
}
