import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Edit, Trash2, Eye, Trash } from 'lucide-react';
import {
    Button,
    Input,
    Badge,
    AppModal,
    Card,
    DataTable,
    type Column,
    Select,
    SelectOption,
    Label,
    TablePaginationFooter,
} from '@dm3/ui';
import { useAccessPoints } from './hooks/useAccessPoints';
import { toast } from '@/lib/toast';
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
    // Map placement fields (map_x/y/rotation/label) intentionally not edited
    // here — they're set via drag-and-drop in the zone editor. We keep any
    // existing values from `initial` so a save doesn't accidentally clobber
    // them, but the modal only exposes the identity fields.
    const [form, setForm] = useState<AccessPointFormData>({
        name: initial?.name ?? '',
        description: initial?.description ?? '',
        zone_id: initial?.zone_id ?? '',
    });
    const [nameError, setNameError] = useState('');

    // Reset form whenever the modal transitions to open. Without this, useState's
    // one-time initializer runs only on first mount, so reopening Create after a
    // Save (or after editing a different access point) shows stale field values.
    useEffect(() => {
        if (open) {
            setForm({
                name: initial?.name ?? '',
                description: initial?.description ?? '',
                zone_id: initial?.zone_id ?? '',
            });
            setNameError('');
            setSubmitting(false);
        }
    }, [open, initial]);

    const handleOpenChange = (v: boolean) => {
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

    const setField = (field: keyof AccessPointFormData, value: AccessPointFormData[keyof AccessPointFormData]) => {
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
                loading: submitting,
            }}
        >
            <div className="space-y-4">
                <div>
                    <Label htmlFor="ap-name">{t('name', 'Name')} *</Label>
                    <Input
                        id="ap-name"
                        value={form.name}
                        onChange={(e) => setField('name', e.target.value)}
                        placeholder={t('namePlaceholder', 'e.g. Main Entrance')}
                        className={nameError ? 'border-destructive' : ''}
                        disabled={submitting}
                    />
                    {nameError && <p className="mt-1 text-[11px] text-destructive">{nameError}</p>}
                </div>

                <div>
                    <Label htmlFor="ap-description">{t('description', 'Description')}</Label>
                    <Input
                        id="ap-description"
                        value={form.description ?? ''}
                        onChange={(e) => setField('description', e.target.value)}
                        placeholder={t('descriptionPlaceholder', 'Optional description')}
                        disabled={submitting}
                    />
                </div>

                <div>
                    <Label>{t('zone', 'Zone')}</Label>
                    <Select
                        value={form.zone_id ?? ''}
                        onValueChange={(v) => setField('zone_id', v)}
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
        pagination,
        filters,
        sortBy,
        sortDir,
        createAccessPoint,
        updateAccessPoint,
        deleteAccessPoint,
        updateFilters,
        changePage,
        changePageSize,
        changeSort,
    } = useAccessPoints();

    const [selected, setSelected] = useState<string[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingAP, setEditingAP] = useState<AccessPoint | null>(null);
    const [deletingAP, setDeletingAP] = useState<AccessPoint | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

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
            await deleteAccessPoint(deletingAP.id);
            setDeletingAP(null);
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

    const handleBulkDeleteConfirm = async () => {
        setBulkDeleteLoading(true);
        try {
            await Promise.all(selected.map((apId) => deleteAccessPoint(apId)));
            toast(t('toast.bulkDeleted', { count: selected.length }), 'success');
            setSelected([]);
            setShowBulkDeleteDialog(false);
        } catch {
            // individual errors already handled inside deleteAccessPoint
        } finally {
            setBulkDeleteLoading(false);
        }
    };

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

    const withDevices = accessPoints.filter((ap) => (ap.access_device_count ?? 0) > 0).length;

    const columns: Column<AccessPoint>[] = [
        {
            key: 'name',
            header: t('columns.name', 'Name'),
            sortable: true,
            render: (ap) => (
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-primary/60 shrink-0" />
                    <div>
                        <p className="text-[13px] font-medium">{ap.name}</p>
                        {ap.description && (
                            <p className="text-[11px] text-muted-foreground">{ap.description}</p>
                        )}
                    </div>
                </div>
            ),
        },
        {
            key: 'zone_id',
            header: t('columns.zone', 'Zone'),
            sortable: true,
            render: (ap) =>
                ap.zone_id && zoneMap.get(ap.zone_id) ? (
                    <Badge variant="outline">{zoneMap.get(ap.zone_id)}</Badge>
                ) : (
                    <span className="text-[13px] text-muted-foreground/50">—</span>
                ),
        },
        {
            key: 'access_device_count',
            header: t('columns.devices', 'Devices'),
            width: '80px',
            sortable: true,
            render: (ap) => <Badge variant="secondary">{ap.access_device_count ?? 0}</Badge>,
        },
        {
            key: 'created_at',
            header: t('columns.created', 'Created'),
            width: '110px',
            sortable: true,
            render: (ap) => (
                <span className="text-[13px] text-muted-foreground">
                    {new Date(ap.created_at).toLocaleDateString()}
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('common:table.actions'),
            width: '96px',
            render: (ap) => (
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/access/access-points/${ap.id}`);
                        }}
                    >
                        <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditingAP(ap);
                        }}
                    >
                        <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={(e) => {
                            e.stopPropagation();
                            setDeletingAP(ap);
                        }}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header & Stats */}
            <div className="shrink-0 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Access Points')}</h1>
                        <p className="text-[13px] text-muted-foreground">{t('description', 'Manage physical access points and their device assignments')}</p>
                    </div>
                    <Button size="sm" onClick={() => setShowCreateModal(true)}>
                        <Plus size={14} className="mr-1.5" />
                        {t('newAccessPoint', 'New Access Point')}
                    </Button>
                </div>

                {/* Stats */}
                {!loading && (
                    <div className="grid grid-cols-3 gap-3">
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{accessPoints.length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.total', 'Total')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{withDevices}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.assigned', 'With Devices')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{filteredAPs.length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.filtered', 'Filtered')}</div>
                        </Card>
                    </div>
                )}

                {/* Search & Zone filter */}
                <div className="flex gap-2">
                    <Input
                        placeholder={t('searchPlaceholder', 'Search by name or description…')}
                        value={filters.search}
                        onChange={(e) => updateFilters({ search: e.target.value })}
                        className="h-8 text-[13px] flex-1"
                    />
                    {zones.length > 0 && (
                        <Select
                            className="w-40 shrink-0 [&_button]:h-8 [&_button]:text-xs"
                            value={filters.zone_id}
                            onValueChange={(v) => updateFilters({ zone_id: v })}
                            placeholder={t('allZones', 'All Zones')}
                        >
                            <SelectOption value="">{t('allZones', 'All Zones')}</SelectOption>
                            {zones.map((z) => (
                                <SelectOption key={z.id} value={z.id}>
                                    {z.name}
                                </SelectOption>
                            ))}
                        </Select>
                    )}
                </div>
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
                        data={filteredAPs}
                        rowKey={(ap) => ap.id}
                        sortState={{ col: sortBy, dir: sortDir }}
                        onSortChange={changeSort}
                        onRowDoubleClick={(ap) => navigate(`/access/access-points/${ap.id}`)}
                        emptyMessage={t('noAccessPoints', 'No access points found')}
                        emptyIcon={<Shield size={32} strokeWidth={1.2} />}
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
                        { value: 'zone_id', label: t('columns.zone', 'Zone') },
                        { value: 'access_device_count', label: t('columns.devices', 'Devices') },
                        { value: 'created_at', label: t('columns.created', 'Created') },
                    ]}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={changeSort}
                />
            </div>


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
                    onOpenChange={(v) => { if (!v) setEditingAP(null); }}
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
                    {t('deleteConfirm', 'Are you sure you want to delete')}{' '}
                    <span className="font-medium text-foreground">"{deletingAP?.name}"</span>?
                </p>
            </AppModal>

            {/* Bulk delete confirmation */}
            <AppModal
                open={showBulkDeleteDialog}
                onOpenChange={(open) => { if (!open) setShowBulkDeleteDialog(false); }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('bulkDeleteTitle', 'Delete Access Points')}
                    </span>
                }
                size="xs"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                cancelDisabled={bulkDeleteLoading}
                primaryAction={{
                    label: bulkDeleteLoading ? t('deleting', 'Deleting…') : t('delete', 'Delete'),
                    variant: 'destructive',
                    onClick: handleBulkDeleteConfirm,
                    loading: bulkDeleteLoading,
                    disabled: bulkDeleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('bulkDeleteConfirm', 'Are you sure you want to delete')}{' '}
                    <span className="font-medium text-foreground">{selected.length}</span>{' '}
                    {t('bulkDeleteSuffix', 'access points? This cannot be undone.')}
                </p>
            </AppModal>
        </div>
    );
}
