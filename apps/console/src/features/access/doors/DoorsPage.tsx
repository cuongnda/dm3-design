import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Cpu, Plus, Search, MoreHorizontal, Edit, Trash2 } from 'lucide-react';
import {
    Button,
    Input,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Badge,
    AppModal,
    DataTableCard,
    DataTable,
    type Column,
    Select,
    SelectOption,
    Label,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessDevices } from './hooks/useAccessDevices';
import type { AccessDevice, AccessDeviceFormData } from './types';

interface AccessDeviceFormState {
    name: string;
    type: string;
    device_id: string;
    unlock_duration_ms: string;
    anti_passback: boolean;
    emergency_unlock: boolean;
}

const emptyForm: AccessDeviceFormState = {
    name: '',
    type: 'door',
    device_id: '',
    unlock_duration_ms: '5000',
    anti_passback: false,
    emergency_unlock: false,
};

const DEVICE_TYPES = ['door', 'gate', 'turnstile'] as const;

function getStatusBadgeClass(status: string): string {
    switch (status) {
        case 'online':
            return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400';
        case 'alarm':
            return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
        case 'offline':
        default:
            return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
    }
}

function getStateBadgeClass(state: string): string {
    switch (state) {
        case 'unlocked':
            return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
        case 'locked':
        default:
            return '';
    }
}

function truncateDeviceId(id?: string): string {
    if (!id) return '—';
    if (id.length <= 12) return id;
    return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function formToData(form: AccessDeviceFormState): AccessDeviceFormData {
    return {
        name: form.name,
        type: form.type,
        device_id: form.device_id || undefined,
        unlock_duration_ms: form.unlock_duration_ms ? parseInt(form.unlock_duration_ms, 10) : undefined,
        anti_passback: form.anti_passback,
        emergency_unlock: form.emergency_unlock,
    };
}

export function AccessDevicesPage() {
    const { t } = useTranslation('doors');

    const { accessDevices, loading, pagination, filters, fetchAccessDevices, createAccessDevice, updateAccessDevice, updateFilters, changePage } =
        useAccessDevices();

    const [selected, setSelected] = useState<string[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingDevice, setEditingDevice] = useState<AccessDevice | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deviceToDelete, setDeviceToDelete] = useState<AccessDevice | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [formData, setFormData] = useState<AccessDeviceFormState>(emptyForm);
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        fetchAccessDevices();
    }, [fetchAccessDevices]);

    const openCreate = () => {
        setFormData(emptyForm);
        setFormErrors({});
        setShowCreateModal(true);
    };

    const openEdit = (device: AccessDevice) => {
        setFormData({
            name: device.name,
            type: device.type,
            device_id: device.device_id ?? '',
            unlock_duration_ms: device.unlock_duration_ms?.toString() ?? '5000',
            anti_passback: device.anti_passback,
            emergency_unlock: device.emergency_unlock,
        });
        setFormErrors({});
        setEditingDevice(device);
    };

    const openDelete = (device: AccessDevice) => {
        setDeviceToDelete(device);
        setDeleteError(null);
        setShowDeleteDialog(true);
    };

    const validateForm = (): boolean => {
        const errors: Record<string, string> = {};
        if (!formData.name.trim()) {
            errors.name = t('validation.nameRequired', 'Name is required');
        }
        if (!formData.type) {
            errors.type = t('validation.typeRequired', 'Type is required');
        }
        if (formData.unlock_duration_ms && (isNaN(parseInt(formData.unlock_duration_ms, 10)) || parseInt(formData.unlock_duration_ms, 10) < 0)) {
            errors.unlock_duration_ms = t('validation.unlockDurationInvalid', 'Must be a positive number');
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreateSubmit = async () => {
        if (!validateForm()) return;
        setSubmitting(true);
        const success = await createAccessDevice(formToData(formData));
        setSubmitting(false);
        if (success) setShowCreateModal(false);
    };

    const handleEditSubmit = async () => {
        if (!editingDevice || !validateForm()) return;
        setSubmitting(true);
        const success = await updateAccessDevice(editingDevice.id, formToData(formData));
        setSubmitting(false);
        if (success) setEditingDevice(null);
    };

    const handleDeleteConfirm = async () => {
        if (!deviceToDelete) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await apiFetch(`/api/v1/access/access-devices/${deviceToDelete.id}`, { method: 'DELETE' });
            setShowDeleteDialog(false);
            setDeviceToDelete(null);
            fetchAccessDevices();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete access device';
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

    const handleBulkDelete = async () => {
        try {
            await apiFetch('/api/v1/access/access-devices/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
            setSelected([]);
            fetchAccessDevices();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Bulk delete failed');
        }
    };

    const handleFieldChange = (field: keyof AccessDeviceFormState, value: string | boolean) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (typeof value === 'string' && formErrors[field]) {
            setFormErrors((prev) => ({ ...prev, [field]: '' }));
        }
    };

    const columns = useMemo(
        (): Column<AccessDevice>[] => [
            {
                key: 'name',
                header: t('columns.name', 'Name'),
                sortable: true,
                render: (d) => (
                    <div className="flex items-center gap-2">
                        <Cpu size={14} className="text-primary shrink-0" />
                        <span className="text-[13px] font-medium">{d.name}</span>
                    </div>
                ),
            },
            {
                key: 'type',
                header: t('columns.type', 'Type'),
                width: '100px',
                render: (d) => (
                    <Badge variant="outline" className="capitalize">
                        {d.type}
                    </Badge>
                ),
            },
            {
                key: 'status',
                header: t('columns.status', 'Status'),
                width: '90px',
                render: (d) => (
                    <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${getStatusBadgeClass(d.status)}`}
                    >
                        {d.status}
                    </span>
                ),
            },
            {
                key: 'state',
                header: t('columns.state', 'State'),
                width: '90px',
                render: (d) => (
                    <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${getStateBadgeClass(d.state)}`}
                    >
                        {d.state}
                    </span>
                ),
            },
            {
                key: 'device_id',
                header: t('columns.deviceId', 'Device ID'),
                width: '120px',
                render: (d) => (
                    <span className="font-mono text-[11px] text-muted-foreground" title={d.device_id}>
                        {truncateDeviceId(d.device_id)}
                    </span>
                ),
            },
            {
                key: 'last_heartbeat_at',
                header: t('columns.lastHeartbeat', 'Last Heartbeat'),
                width: '130px',
                render: (d) =>
                    d.last_heartbeat_at ? (
                        <span className="text-[12px] text-muted-foreground">{new Date(d.last_heartbeat_at).toLocaleString()}</span>
                    ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                    ),
            },
            {
                key: 'actions',
                header: '',
                width: '48px',
                render: (d) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    <MoreHorizontal size={14} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openEdit(d)}>
                                    <Edit size={14} className="mr-2" />
                                    {t('actions.edit', 'Edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openDelete(d)} className="text-destructive">
                                    <Trash2 size={14} className="mr-2" />
                                    {t('actions.delete', 'Delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
            },
        ],
        [t],
    );

    const deviceForm = (
        <div className="space-y-4">
            {/* Name */}
            <div>
                <Label htmlFor="device-name">{t('form.name', 'Name')} *</Label>
                <Input
                    id="device-name"
                    value={formData.name}
                    onChange={(e) => handleFieldChange('name', e.target.value)}
                    placeholder={t('form.namePlaceholder', 'Access device name')}
                    className={formErrors.name ? 'border-destructive' : ''}
                    disabled={submitting}
                />
                {formErrors.name && <p className="text-sm text-destructive mt-1">{formErrors.name}</p>}
            </div>

            {/* Type */}
            <div>
                <Label>{t('form.type', 'Type')} *</Label>
                <Select
                    value={formData.type}
                    onValueChange={(value) => handleFieldChange('type', value)}
                    placeholder={t('form.selectType', 'Select type')}
                    disabled={submitting}
                >
                    {DEVICE_TYPES.map((type) => (
                        <SelectOption key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                        </SelectOption>
                    ))}
                </Select>
                {formErrors.type && <p className="text-sm text-destructive mt-1">{formErrors.type}</p>}
            </div>

            {/* Device ID */}
            <div>
                <Label htmlFor="device-device-id">{t('form.deviceId', 'Device ID')}</Label>
                <Input
                    id="device-device-id"
                    value={formData.device_id}
                    onChange={(e) => handleFieldChange('device_id', e.target.value)}
                    placeholder={t('form.deviceIdPlaceholder', 'Optional device identifier')}
                    disabled={submitting}
                />
            </div>

            {/* Unlock Duration */}
            <div>
                <Label htmlFor="device-unlock-duration">{t('form.unlockDuration', 'Unlock Duration (ms)')}</Label>
                <Input
                    id="device-unlock-duration"
                    type="number"
                    min="0"
                    value={formData.unlock_duration_ms}
                    onChange={(e) => handleFieldChange('unlock_duration_ms', e.target.value)}
                    placeholder="5000"
                    className={formErrors.unlock_duration_ms ? 'border-destructive' : ''}
                    disabled={submitting}
                />
                {formErrors.unlock_duration_ms && <p className="text-sm text-destructive mt-1">{formErrors.unlock_duration_ms}</p>}
            </div>

            {/* Anti-Passback */}
            <div className="flex items-center gap-3">
                <input
                    id="device-anti-passback"
                    type="checkbox"
                    checked={formData.anti_passback}
                    onChange={(e) => handleFieldChange('anti_passback', e.target.checked)}
                    disabled={submitting}
                    className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="device-anti-passback" className="cursor-pointer">
                    {t('form.antiPassback', 'Anti-Passback')}
                </Label>
            </div>

            {/* Emergency Unlock */}
            <div className="flex items-center gap-3">
                <input
                    id="device-emergency-unlock"
                    type="checkbox"
                    checked={formData.emergency_unlock}
                    onChange={(e) => handleFieldChange('emergency_unlock', e.target.checked)}
                    disabled={submitting}
                    className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="device-emergency-unlock" className="cursor-pointer">
                    {t('form.emergencyUnlock', 'Emergency Unlock')}
                </Label>
            </div>
        </div>
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Access Devices')}</h1>
                    <p className="text-[13px] text-muted-foreground">{t('description', 'Manage physical access devices')}</p>
                </div>
                <Button size="sm" onClick={openCreate}>
                    <Plus size={14} className="mr-1.5" />
                    {t('addDevice', 'Add Device')}
                </Button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder={t('searchPlaceholder', 'Search access devices...')}
                        value={filters.search}
                        onChange={(e) => updateFilters({ search: e.target.value })}
                        className="pl-9"
                    />
                </div>
                <div className="w-40 shrink-0">
                    <Select
                        value={filters.status}
                        onValueChange={(value) => updateFilters({ status: value })}
                        placeholder={t('allStatuses', 'All Statuses')}
                    >
                        <SelectOption value="">{t('allStatuses', 'All Statuses')}</SelectOption>
                        <SelectOption value="online">{t('statusOnline', 'Online')}</SelectOption>
                        <SelectOption value="offline">{t('statusOffline', 'Offline')}</SelectOption>
                        <SelectOption value="alarm">{t('statusAlarm', 'Alarm')}</SelectOption>
                    </Select>
                </div>
            </div>

            {/* Table */}
            <DataTableCard
                title={
                    <span className="text-[14px] font-semibold">
                        {t('tableTitle', 'Access Devices')} ({pagination.total})
                    </span>
                }
                selectedCount={selected.length}
                onClearSelection={() => setSelected([])}
                onBulkDelete={handleBulkDelete}
                bulkDeleteLabel={`${selected.length} access devices`}
                pagination={{
                    page: pagination.page,
                    pageSize: pagination.limit,
                    total: pagination.total,
                    totalPages: Math.ceil(pagination.total / pagination.limit),
                    pageSizeOptions: [10, 20, 50],
                    onPageChange: changePage,
                    onPageSizeChange: () => {},
                    loading,
                }}
            >
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    </div>
                ) : accessDevices.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-muted-foreground">
                        {filters.search || filters.status
                            ? t('noResults', 'No access devices match your filters')
                            : t('empty', 'No access devices yet. Add the first one.')}
                    </div>
                ) : (
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        columns={columns}
                        data={accessDevices}
                        rowKey={(d) => d.id}
                        onRowDoubleClick={(d) => openEdit(d)}
                        selection={{
                            selectedIds: selected,
                            onSelectedIdsChange: setSelected,
                            selectAllScope: 'page',
                            selectOnRowClick: true,
                        }}
                    />
                )}
            </DataTableCard>

            {/* Create Modal */}
            <AppModal
                open={showCreateModal}
                onOpenChange={setShowCreateModal}
                title={
                    <span className="flex items-center gap-2">
                        <Cpu size={16} />
                        {t('createDevice', 'Create Access Device')}
                    </span>
                }
                size="sm"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: submitting ? t('saving', 'Saving...') : t('save', 'Save'),
                    onClick: handleCreateSubmit,
                    disabled: submitting,
                }}
            >
                {deviceForm}
            </AppModal>

            {/* Edit Modal */}
            <AppModal
                open={!!editingDevice}
                onOpenChange={(open) => {
                    if (!open) setEditingDevice(null);
                }}
                title={
                    <span className="flex items-center gap-2">
                        <Cpu size={16} />
                        {t('editDevice', 'Edit Access Device')}
                    </span>
                }
                size="sm"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: submitting ? t('saving', 'Saving...') : t('save', 'Save'),
                    onClick: handleEditSubmit,
                    disabled: submitting,
                }}
            >
                {deviceForm}
            </AppModal>

            {/* Delete Confirmation */}
            <AppModal
                open={showDeleteDialog}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowDeleteDialog(false);
                        setDeviceToDelete(null);
                        setDeleteError(null);
                    }
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('deleteDevice', 'Delete Access Device')}
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
                    <span className="font-medium text-foreground">"{deviceToDelete?.name}"</span>?
                </p>
            </AppModal>
        </div>
    );
}
