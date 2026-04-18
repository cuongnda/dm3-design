import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus, Edit, Trash2, Eye, Trash, Unlock, Lock, DoorOpen, DoorClosed, RotateCcw, ShieldAlert, AlertTriangle, MapPin } from 'lucide-react';
import { apiFetch } from '@/lib/api';
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
import { buildZonePathMap, ZonePathLabel } from '../shared/zone-path';

const doorStateConfig: Record<string, { color: string; label: string; icon: typeof Lock }> = {
    closed:     { color: 'border-success/30 bg-success/10 text-success',         label: 'Closed',      icon: Lock },
    open:       { color: 'border-warning/30 bg-warning/10 text-warning',         label: 'Open',        icon: Unlock },
    held_open:  { color: 'border-operate/30 bg-operate/10 text-operate',         label: 'Held Open',   icon: DoorOpen },
    held_close: { color: 'border-error/30 bg-error/10 text-error',              label: 'Held Close',  icon: ShieldAlert },
    forced:     { color: 'border-error/30 bg-error/10 text-error',              label: 'Forced',      icon: AlertTriangle },
    alarm:      { color: 'border-error/30 bg-error/10 text-error animate-pulse',label: 'Alarm',       icon: ShieldAlert },
};

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

    // Bulk door command state
    const [bulkDoorAction, setBulkDoorAction] = useState<null | 'unlock' | 'lock' | 'hold_open' | 'hold_close' | 'release'>(null);
    const [bulkDoorLoading, setBulkDoorLoading] = useState(false);
    const [bulkUnlockSeconds, setBulkUnlockSeconds] = useState(3);

    const zonePathById = useMemo(() => buildZonePathMap(zones), [zones]);

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

    // Send one bulk request to the backend. Server fans out per access point
    // and returns a per-AP result set so we can report successes + skips in a
    // single toast without N round-trips.
    const runBulkDoorCommand = async (
        action: 'unlock' | 'lock' | 'hold_open' | 'hold_close' | 'release',
        durationMs?: number,
    ) => {
        if (selected.length === 0) return;
        setBulkDoorLoading(true);
        try {
            const body: Record<string, unknown> = {
                access_point_ids: selected,
                action,
                reason: 'bulk_remote_command',
            };
            if (durationMs != null) body.duration_ms = durationMs;
            const res = await apiFetch<{
                summary: { ok: number; no_devices: number; offline: number; failed: number };
            }>(`/api/v1/gateway/access-points/door-command/bulk`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            const s = res.summary;
            const ok = s.ok;
            const skipped = s.no_devices + s.offline;
            const failed = s.failed;
            if (ok === selected.length) {
                toast(t('bulkDoor.toast.allOk', '{{count}} door(s) dispatched', { count: ok }), 'success');
            } else if (ok === 0) {
                toast(t('bulkDoor.toast.allFailed', 'All {{count}} door command(s) failed', { count: selected.length }), 'error');
            } else {
                toast(
                    t('bulkDoor.toast.mixed', '{{ok}} dispatched · {{skipped}} skipped · {{failed}} failed', {
                        ok, skipped, failed,
                    }),
                    skipped + failed > ok ? 'error' : 'success',
                );
            }
        } catch (err) {
            toast(err instanceof Error ? err.message : 'Bulk door command failed', 'error');
        } finally {
            setBulkDoorLoading(false);
            setBulkDoorAction(null);
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
            render: (ap) => {
                const path = ap.zone_id ? zonePathById.get(ap.zone_id) : undefined;
                if (path) {
                    return (
                        <span className="inline-flex items-center gap-1.5">
                            <MapPin size={11} className="text-muted-foreground shrink-0" />
                            <ZonePathLabel path={path} />
                        </span>
                    );
                }
                if (ap.zone_name) {
                    return (
                        <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
                            <MapPin size={11} />
                            {ap.zone_name}
                        </span>
                    );
                }
                return <span className="text-[13px] text-muted-foreground/50">—</span>;
            },
        },
        {
            key: 'device_status',
            header: t('columns.status', 'Status'),
            width: '100px',
            sortable: true,
            render: (ap) => {
                const s = ap.device_status;
                const color = s === 'online' ? 'text-success' : s === 'warning' ? 'text-warning' : 'text-muted-foreground';
                const dot = s === 'online' ? 'bg-success animate-pulse' : s === 'warning' ? 'bg-warning animate-pulse' : 'bg-muted-foreground';
                const label = s === 'online' ? 'Online' : s === 'warning' ? 'Warning' : 'Offline';
                return (
                    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium ${color}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                        {label}
                    </span>
                );
            },
        },
        {
            key: 'door_state',
            header: t('columns.doorState', 'Door State'),
            width: '120px',
            sortable: true,
            render: (ap) => {
                if (!ap.door_state) return <span className="text-[11px] text-muted-foreground">—</span>;
                const cfg = doorStateConfig[ap.door_state] || { color: 'text-muted-foreground', label: ap.door_state, icon: Lock };
                const Icon = cfg.icon;
                return (
                    <Badge variant="outline" className={`text-[11px] gap-1 ${cfg.color}`}>
                        <Icon size={11} /> {cfg.label}
                    </Badge>
                );
            },
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
                        emptyIcon={<Shield size={32} strokeWidth={1.2} />}
                        emptyTitle={(filters.search || filters.zone_id)
                            ? t('empty.searchTitle', 'No access points match these filters')
                            : t('empty.defaultTitle', 'No access points yet')}
                        emptyDescription={(filters.search || filters.zone_id)
                            ? t('empty.searchHint', 'Try a different keyword or clear the zone filter.')
                            : t('empty.defaultHint', 'Create an access point for each door, gate, or turnstile you want to control, then assign readers and rules.')}
                        emptyAction={(filters.search || filters.zone_id)
                            ? { label: t('empty.clearFilters', 'Clear filters'), variant: 'outline', onClick: () => updateFilters({ search: '', zone_id: '' }), 'data-testid': 'access-points-button-clear-filters-empty' }
                            : { label: t('empty.createAction', 'New Access Point'), icon: <Plus size={14} />, onClick: () => setShowCreateModal(true), 'data-testid': 'access-points-button-create-empty' }}
                        selection={{
                            selectedIds: selected,
                            onSelectedIdsChange: setSelected,
                            selectAllScope: 'page',
                            selectOnRowClick: true,
                            bulkActions: [
                                {
                                    icon: <Unlock size={13} />,
                                    label: t('bulkDoor.unlock', 'Unlock'),
                                    variant: 'ghost',
                                    onClick: () => setBulkDoorAction('unlock'),
                                },
                                {
                                    icon: <Lock size={13} />,
                                    label: t('bulkDoor.lock', 'Lock'),
                                    variant: 'ghost',
                                    onClick: () => setBulkDoorAction('lock'),
                                },
                                {
                                    icon: <DoorOpen size={13} />,
                                    label: t('bulkDoor.holdOpen', 'Hold open'),
                                    variant: 'ghost',
                                    onClick: () => setBulkDoorAction('hold_open'),
                                },
                                {
                                    icon: <DoorClosed size={13} />,
                                    label: t('bulkDoor.holdClose', 'Hold closed'),
                                    variant: 'ghost',
                                    onClick: () => setBulkDoorAction('hold_close'),
                                },
                                {
                                    icon: <RotateCcw size={13} />,
                                    label: t('bulkDoor.release', 'Release'),
                                    variant: 'ghost',
                                    onClick: () => setBulkDoorAction('release'),
                                },
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

            {/* Bulk door command confirmation */}
            <AppModal
                open={bulkDoorAction !== null}
                onOpenChange={(open) => { if (!open) setBulkDoorAction(null); }}
                title={bulkDoorAction ? (() => {
                    const count = selected.length;
                    switch (bulkDoorAction) {
                        case 'unlock':     return t('bulkDoor.confirmTitle.unlock', 'Unlock {{count}} doors?', { count });
                        case 'lock':       return t('bulkDoor.confirmTitle.lock', 'Lock {{count}} doors?', { count });
                        case 'hold_open':  return t('bulkDoor.confirmTitle.holdOpen', 'Hold {{count}} doors open?', { count });
                        case 'hold_close': return t('bulkDoor.confirmTitle.holdClose', 'Hold {{count}} doors closed?', { count });
                        case 'release':    return t('bulkDoor.confirmTitle.release', 'Release hold on {{count}} doors?', { count });
                    }
                })() : ''}
                size="xs"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                cancelDisabled={bulkDoorLoading}
                primaryAction={{
                    label: bulkDoorLoading
                        ? t('bulkDoor.sending', 'Sending…')
                        : t('bulkDoor.confirm', 'Confirm'),
                    onClick: () => {
                        if (!bulkDoorAction) return;
                        const durationMs = bulkDoorAction === 'unlock' ? bulkUnlockSeconds * 1000 : undefined;
                        runBulkDoorCommand(bulkDoorAction, durationMs);
                    },
                    loading: bulkDoorLoading,
                    disabled: bulkDoorLoading,
                }}
            >
                <div className="space-y-3 text-[13px]">
                    <p className="text-muted-foreground">
                        {t('bulkDoor.confirmBody', 'This will send the command to every selected access point in parallel. Access points with any offline device will be skipped.')}
                    </p>
                    {bulkDoorAction === 'unlock' && (
                        <div className="flex items-center gap-2">
                            <Label htmlFor="bulk-unlock-seconds" className="text-[12px] text-muted-foreground">
                                {t('bulkDoor.duration', 'Duration (s)')}
                            </Label>
                            <Input
                                id="bulk-unlock-seconds"
                                type="number"
                                min={1}
                                max={60}
                                value={bulkUnlockSeconds}
                                onChange={(e) => setBulkUnlockSeconds(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                                className="h-8 w-20"
                                disabled={bulkDoorLoading}
                            />
                        </div>
                    )}
                    {(bulkDoorAction === 'hold_open' || bulkDoorAction === 'hold_close') && (
                        <p className="rounded-md border border-amber-400/40 bg-amber-500/10 p-2 text-[12px] text-amber-700 dark:text-amber-300">
                            {bulkDoorAction === 'hold_open'
                                ? t('bulkDoor.holdOpenWarn', 'Doors will stay unlocked until you send Release.')
                                : t('bulkDoor.holdCloseWarn', 'Doors will refuse all credentials until you send Release. Use for lockdown only.')}
                        </p>
                    )}
                </div>
            </AppModal>
        </div>
    );
}
