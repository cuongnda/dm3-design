import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Edit, Trash2, Trash, Map } from 'lucide-react';
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
import type { Zone, ZoneFormData, ZoneMapResponse } from './types';

interface ZoneFormState {
    name: string;
    description: string;
    parent_id: string;
    timezone: string;
    address: string;
    building: string;
    floor: string;
    geo_lat: string;
    geo_lng: string;
    map_image_url: string;
    map_image_width: string;
    map_image_height: string;
}

const emptyForm: ZoneFormState = {
    name: '',
    description: '',
    parent_id: '',
    timezone: 'Asia/Ho_Chi_Minh',
    address: '',
    building: '',
    floor: '',
    geo_lat: '',
    geo_lng: '',
    map_image_url: '',
    map_image_width: '',
    map_image_height: '',
};

function zoneFormToData(form: ZoneFormState): ZoneFormData {
    return {
        name: form.name,
        description: form.description || undefined,
        parent_id: form.parent_id || undefined,
        timezone: form.timezone || undefined,
        address: form.address || undefined,
        building: form.building || undefined,
        floor: form.floor || undefined,
        geo_lat: form.geo_lat === '' ? undefined : Number(form.geo_lat),
        geo_lng: form.geo_lng === '' ? undefined : Number(form.geo_lng),
        map_image_url: form.map_image_url || undefined,
        map_image_width: form.map_image_width === '' ? undefined : Number(form.map_image_width),
        map_image_height: form.map_image_height === '' ? undefined : Number(form.map_image_height),
        map_metadata: { origin: 'top-left' },
    };
}

export function ZonesPage() {
    const { t } = useTranslation('zones');

    const { zones, loading, pagination, sortBy, sortDir, fetchZones, createZone, updateZone, deleteZone, changePage, changePageSize, changeSort } = useZones();

    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingZone, setEditingZone] = useState<Zone | null>(null);
    const [layoutZone, setLayoutZone] = useState<Zone | null>(null);
    const [layoutData, setLayoutData] = useState<ZoneMapResponse | null>(null);
    const [selectedPointId, setSelectedPointId] = useState<string>('');
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
        return zones.filter((z) =>
            z.name.toLowerCase().includes(q) ||
            (z.description ?? '').toLowerCase().includes(q) ||
            (z.building ?? '').toLowerCase().includes(q) ||
            (z.floor ?? '').toLowerCase().includes(q),
        );
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
            timezone: zone.timezone ?? 'Asia/Ho_Chi_Minh',
            address: zone.address ?? '',
            building: zone.building ?? '',
            floor: zone.floor ?? '',
            geo_lat: zone.geo_lat?.toString() ?? '',
            geo_lng: zone.geo_lng?.toString() ?? '',
            map_image_url: zone.map_image_url ?? '',
            map_image_width: zone.map_image_width?.toString() ?? '',
            map_image_height: zone.map_image_height?.toString() ?? '',
        });
        setFormErrors({});
        setEditingZone(zone);
    };

    const openDelete = (zone: Zone) => {
        setZoneToDelete(zone);
        setDeleteError(null);
        setShowDeleteDialog(true);
    };

    const openLayout = async (zone: Zone) => {
        setLayoutZone(zone);
        const data = await apiFetch<ZoneMapResponse>(`/api/v1/access/zones/${zone.id}/map`);
        setLayoutData(data);
        setSelectedPointId(data.access_points[0]?.id ?? '');
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.name.trim()) errors.name = t('validation.nameRequired', 'Name is required');
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
        const ok = await deleteZone(zoneToDelete.id);
        if (ok) {
            setShowDeleteDialog(false);
            setZoneToDelete(null);
            fetchZones();
            toast(t('toast.deleted'), 'success');
        }
        setDeleteLoading(false);
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
        if (formErrors[field]) setFormErrors((prev) => ({ ...prev, [field]: '' }));
    };

    const selectedPoint = layoutData?.access_points.find((item) => item.id === selectedPointId);

    const handleMapClick = async (event: React.MouseEvent<HTMLDivElement>) => {
        if (!layoutZone || !selectedPoint) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const mapX = Number(((event.clientX - rect.left) / rect.width).toFixed(3));
        const mapY = Number(((event.clientY - rect.top) / rect.height).toFixed(3));
        await apiFetch(`/api/v1/access/access-points/${selectedPoint.id}`, {
            method: 'PUT',
            body: JSON.stringify({ map_x: mapX, map_y: mapY, zone_id: layoutZone.id }),
        });
        const refreshed = await apiFetch<ZoneMapResponse>(`/api/v1/access/zones/${layoutZone.id}/map`);
        setLayoutData(refreshed);
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
                                <div className="text-[11px] text-muted-foreground">{z.building || '—'} • {z.floor || '—'} • {z.timezone || '—'}</div>
                                {parentName && <div className="text-[11px] text-muted-foreground">Parent: {parentName}</div>}
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
                        <Button variant="ghost" size="icon-sm" onClick={() => openLayout(z)}>
                            <Map className="w-4 h-4" />
                        </Button>
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
                <Input id="zone-name" value={formData.name} onChange={(e) => handleFieldChange('name', e.target.value)} className={formErrors.name ? 'border-destructive' : ''} disabled={submitting} />
                {formErrors.name && <p className="text-sm text-destructive mt-1">{formErrors.name}</p>}
            </div>
            <div>
                <Label htmlFor="zone-description">Description</Label>
                <Input id="zone-description" value={formData.description} onChange={(e) => handleFieldChange('description', e.target.value)} disabled={submitting} />
            </div>
            <div>
                <Label>Parent Zone</Label>
                <Select value={formData.parent_id} onValueChange={(value) => handleFieldChange('parent_id', value)} disabled={submitting}>
                    <SelectOption value="">No parent</SelectOption>
                    {zones.filter((z) => !editingZone || z.id !== editingZone.id).map((z) => <SelectOption key={z.id} value={z.id}>{z.name}</SelectOption>)}
                </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label>Timezone</Label>
                    <Input value={formData.timezone} onChange={(e) => handleFieldChange('timezone', e.target.value)} disabled={submitting} />
                </div>
                <div>
                    <Label>Address</Label>
                    <Input value={formData.address} onChange={(e) => handleFieldChange('address', e.target.value)} disabled={submitting} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label>Building</Label>
                    <Input value={formData.building} onChange={(e) => handleFieldChange('building', e.target.value)} disabled={submitting} />
                </div>
                <div>
                    <Label>Floor</Label>
                    <Input value={formData.floor} onChange={(e) => handleFieldChange('floor', e.target.value)} disabled={submitting} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label>Geo Lat</Label>
                    <Input value={formData.geo_lat} onChange={(e) => handleFieldChange('geo_lat', e.target.value)} disabled={submitting} />
                </div>
                <div>
                    <Label>Geo Lng</Label>
                    <Input value={formData.geo_lng} onChange={(e) => handleFieldChange('geo_lng', e.target.value)} disabled={submitting} />
                </div>
            </div>
            <div>
                <Label>Map Image URL</Label>
                <Input value={formData.map_image_url} onChange={(e) => handleFieldChange('map_image_url', e.target.value)} disabled={submitting} />
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label>Map Width</Label>
                    <Input value={formData.map_image_width} onChange={(e) => handleFieldChange('map_image_width', e.target.value)} disabled={submitting} />
                </div>
                <div>
                    <Label>Map Height</Label>
                    <Input value={formData.map_image_height} onChange={(e) => handleFieldChange('map_image_height', e.target.value)} disabled={submitting} />
                </div>
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

            <AppModal open={!!layoutZone} onOpenChange={(open) => { if (!open) { setLayoutZone(null); setLayoutData(null); } }} title={<span className="flex items-center gap-2"><Map size={16} />Zone Layout</span>} size="lg" showCancelButton cancelLabel="Close">
                {!layoutData ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Loading layout...</div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center gap-3">
                            <Select value={selectedPointId} onValueChange={setSelectedPointId}>
                                {layoutData.access_points.map((point) => <SelectOption key={point.id} value={point.id}>{point.name}</SelectOption>)}
                            </Select>
                            <Badge variant="outline">Click map to place selected access point</Badge>
                        </div>
                        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                            <div className="relative h-80 rounded-lg border border-dashed border-border bg-muted/20 overflow-hidden" onClick={handleMapClick}>
                                {layoutData.zone.map_image_url ? (
                                    <img src={layoutData.zone.map_image_url} alt={layoutData.zone.name} className="absolute inset-0 h-full w-full object-cover opacity-60" />
                                ) : null}
                                {layoutData.access_points.map((point) => (
                                    <button
                                        key={point.id}
                                        type="button"
                                        className={`absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${point.id === selectedPointId ? 'border-white bg-primary' : 'border-primary bg-background'}`}
                                        style={{ left: `${(point.map_x ?? 0.5) * 100}%`, top: `${(point.map_y ?? 0.5) * 100}%` }}
                                        onClick={(e) => { e.stopPropagation(); setSelectedPointId(point.id); }}
                                    />
                                ))}
                            </div>
                            <div className="space-y-2 text-sm">
                                <div><span className="text-muted-foreground">Timezone:</span> {layoutData.zone.timezone}</div>
                                <div><span className="text-muted-foreground">Location:</span> {layoutData.zone.building || '—'} / {layoutData.zone.floor || '—'}</div>
                                <div><span className="text-muted-foreground">Map:</span> {layoutData.zone.map_image_url ? 'Configured' : 'Not configured'}</div>
                                <div><span className="text-muted-foreground">Access points:</span> {layoutData.access_points.length}</div>
                                {selectedPoint && (
                                    <div className="rounded-lg border border-border p-3">
                                        <div className="font-medium">{selectedPoint.name}</div>
                                        <div className="text-muted-foreground">X: {selectedPoint.map_x ?? '—'} / Y: {selectedPoint.map_y ?? '—'}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </AppModal>

            <AppModal open={showDeleteDialog} onOpenChange={(open) => { if (!open) { setShowDeleteDialog(false); setZoneToDelete(null); setDeleteError(null); } }} title={<span className="flex items-center gap-2 text-destructive"><Trash2 size={16} />Delete Zone</span>} size="xs" style={{ maxWidth: '22rem' }} showCancelButton cancelLabel="Cancel" cancelDisabled={deleteLoading} errorMessage={deleteError ?? undefined} primaryAction={{ label: deleteLoading ? 'Deleting...' : 'Delete', variant: 'destructive', onClick: handleDeleteConfirm, loading: deleteLoading, disabled: deleteLoading }}>
                <p className="text-[13px] text-muted-foreground">Are you sure you want to delete <span className="font-medium text-foreground">"{zoneToDelete?.name}"</span>?</p>
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
