import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Shield, Plus, Trash2, Cpu, Edit, Unlock, Lock, DoorOpen, DoorClosed } from 'lucide-react';
import {
    Button,
    Input,
    Label,
    Badge,
    AppModal,
    DataTable,
    type Column,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Select,
    SelectOption,
    Checkbox,
    TablePaginationFooter,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { AccessPoint, AccessPointDevice } from './types';

// ---------------------------------------------------------------------------
// Types local to this page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Add Device Modal
// ---------------------------------------------------------------------------

const DEVICE_ROLES = [
    { value: 'reader_in', label: 'Reader In' },
    { value: 'reader_out', label: 'Reader Out' },
    { value: 'controller', label: 'Controller' },
    { value: 'camera', label: 'Camera' },
] as const;

interface AvailableDevice {
    id: string;
    name?: string;
    device_id?: string;
    type?: string;
    status?: string;
}

interface AddDeviceModalProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    linkedDeviceIds: string[];
    onSubmit: (access_device_ids: string[], role: string) => Promise<boolean>;
}

function AddDeviceModal({ open, onOpenChange, linkedDeviceIds, onSubmit }: AddDeviceModalProps) {
    const { t } = useTranslation('accessPoints');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [role, setRole] = useState('reader_in');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [allDevices, setAllDevices] = useState<AvailableDevice[]>([]);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;

    useEffect(() => {
        if (!open) return;
        setLoadingDevices(true);
        apiFetch<AvailableDevice[]>('/api/v1/gateway/devices?limit=200')
            .then((res) => setAllDevices(Array.isArray(res) ? res : []))
            .catch(() => setAllDevices([]))
            .finally(() => setLoadingDevices(false));
    }, [open]);

    const availableDevices = useMemo(() => allDevices.filter((d) => !linkedDeviceIds.includes(d.id)), [allDevices, linkedDeviceIds]);

    const filteredDevices = useMemo(() => {
        let result = availableDevices;

        // Filter by type
        if (filterType !== 'all') {
            result = result.filter((d) => d.type === filterType);
        }

        // Filter by search
        const q = search.toLowerCase();
        if (q) {
            result = result.filter((d) => (d.name ?? '').toLowerCase().includes(q) || (d.device_id ?? '').toLowerCase().includes(q) || d.type?.toLowerCase().includes(q));
        }

        return result;
    }, [availableDevices, search, filterType]);

    // Reset to page 1 when search, filter, or available devices change
    useEffect(() => {
        setPage(1);
    }, [search, filterType, availableDevices.length]);

    const totalPages = Math.max(1, Math.ceil(filteredDevices.length / PAGE_SIZE));
    const pagedDevices = filteredDevices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const allFilteredSelected = filteredDevices.length > 0 && filteredDevices.every((d) => selected.has(d.id));
    const someFilteredSelected = filteredDevices.some((d) => selected.has(d.id));

    const toggleAll = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                filteredDevices.forEach((d) => next.delete(d.id));
            } else {
                filteredDevices.forEach((d) => next.add(d.id));
            }
            return next;
        });
    };

    const toggleOne = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleOpenChange = (v: boolean) => {
        if (!v) {
            setSelected(new Set());
            setError('');
            setSearch('');
            setFilterType('all');
            setRole('reader_in');
            setPage(1);
        }
        onOpenChange(v);
    };

    const handleSubmit = async () => {
        if (selected.size === 0) {
            setError(t('selectDeviceRequired'));
            return;
        }
        setSubmitting(true);
        const ok = await onSubmit([...selected], role);
        setSubmitting(false);
        if (ok) onOpenChange(false);
    };

    return (
        <AppModal
            open={open}
            onOpenChange={handleOpenChange}
            title={
                <span className="flex items-center gap-2">
                    <Cpu size={16} />
                    {t('addDevice', 'Add Device')}
                </span>
            }
            size="md"
            showCancelButton
            cancelLabel={t('cancel', 'Cancel')}
            errorMessage={error || undefined}
            primaryAction={{
                label: submitting ? t('adding') : selected.size > 0 ? t('addNDevices', { count: selected.size }) : t('add'),
                onClick: handleSubmit,
                disabled: submitting || selected.size === 0,
                loading: submitting,
            }}
        >
            <div className="space-y-3">
                {/* Search */}
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('searchDevices')}
                    className="h-8 text-[13px]"
                    disabled={submitting}
                />

                {/* Type Filter */}
                <div className="flex gap-2">
                    <Button
                        variant={filterType === 'all' ? 'default' : 'outline'}
                        onClick={() => setFilterType('all')}
                        className="h-8 text-[13px]"
                        disabled={submitting}
                    >
                        All
                    </Button>
                    <Button
                        variant={filterType === 'camera' ? 'default' : 'outline'}
                        onClick={() => setFilterType('camera')}
                        className="h-8 text-[13px]"
                        disabled={submitting}
                    >
                        Camera
                    </Button>
                    <Button
                        variant={filterType === 'reader' ? 'default' : 'outline'}
                        onClick={() => setFilterType('reader')}
                        className="h-8 text-[13px]"
                        disabled={submitting}
                    >
                        Reader
                    </Button>
                    <Button
                        variant={filterType === 'controller' ? 'default' : 'outline'}
                        onClick={() => setFilterType('controller')}
                        className="h-8 text-[13px]"
                        disabled={submitting}
                    >
                        Controller
                    </Button>
                </div>

                {/* Role Selector */}
                <div className="flex items-center gap-2">
                    <Label className="text-[13px] shrink-0">{t('role', 'Role')}:</Label>
                    <Select value={role} onValueChange={setRole} disabled={submitting} className="h-8 text-[13px] flex-1">
                        {DEVICE_ROLES.map((r) => (
                            <SelectOption key={r.value} value={r.value}>
                                {r.label}
                            </SelectOption>
                        ))}
                    </Select>
                </div>

                {/* Device table */}
                <div className="rounded-md border border-border overflow-hidden">
                    {loadingDevices ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                            Loading…
                        </div>
                    ) : availableDevices.length === 0 ? (
                        <div className="py-10 text-center text-[13px] text-muted-foreground">
                            {allDevices.length === 0 ? t('noDevicesInSystem') : t('allDevicesAssigned')}
                        </div>
                    ) : filteredDevices.length === 0 ? (
                        <div className="py-10 text-center text-[13px] text-muted-foreground">{t('noDevicesMatch')}</div>
                    ) : (
                        <>
                            <table className="w-full text-[13px]">
                                <thead className="bg-muted/60 border-b border-border">
                                    <tr>
                                        <th className="w-10 px-3 py-2 text-left">
                                            <Checkbox
                                                checked={allFilteredSelected}
                                                indeterminate={someFilteredSelected && !allFilteredSelected}
                                                onCheckedChange={toggleAll}
                                                disabled={submitting}
                                            />
                                        </th>
                                        <th className="px-3 py-2 text-left font-medium text-foreground">{t('deviceName')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-foreground">{t('deviceType')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-foreground">{t('status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedDevices.map((d) => (
                                        <tr
                                            key={d.id}
                                            onClick={() => !submitting && toggleOne(d.id)}
                                            className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/40 transition-colors"
                                        >
                                            <td className="w-10 px-3 py-2">
                                                <Checkbox
                                                    checked={selected.has(d.id)}
                                                    onCheckedChange={() => toggleOne(d.id)}
                                                    disabled={submitting}
                                                />
                                            </td>
                                            <td className="px-3 py-2 font-medium text-foreground">{d.name || d.device_id || '—'}</td>
                                            <td className="px-3 py-2">
                                                {d.type ? (
                                                    <Badge variant="outline" className="text-[11px]">
                                                        {d.type}
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2">
                                                <DeviceStatusBadge status={d.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <TablePaginationFooter
                                page={page}
                                pageSize={PAGE_SIZE}
                                total={filteredDevices.length}
                                totalPages={totalPages}
                                onPageChange={setPage}
                                loading={loadingDevices}
                                className="border-t border-border"
                            />
                        </>
                    )}
                </div>

                {selected.size > 0 && <p className="text-[12px] text-muted-foreground">{t('devicesSelected', { count: selected.size })}</p>}
            </div>
        </AppModal>
    );
}

// ---------------------------------------------------------------------------
// Device status badge helper
// ---------------------------------------------------------------------------

function DeviceStatusBadge({ status }: { status?: string }) {
    const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
        online: 'default',
        offline: 'secondary',
        alarm: 'destructive',
        warning: 'outline',
    };
    const v = status ? (variantMap[status] ?? 'outline') : 'outline';
    return <Badge variant={v}>{status ?? '—'}</Badge>;
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
    if (role === 'reader_in' || role === 'reader_out') return 'default';
    if (role === 'controller') return 'secondary';
    return 'outline';
}

function roleLabel(role: string): string {
    return DEVICE_ROLES.find((r) => r.value === role)?.label ?? role;
}

// ---------------------------------------------------------------------------
// AccessPointDetailPage
// ---------------------------------------------------------------------------

export function AccessPointDetailPage() {
    const { t } = useTranslation('accessPoints');
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();

    // AP details
    const [ap, setAP] = useState<AccessPoint | null>(null);
    const [apLoading, setAPLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Devices tab
    const [devices, setDevices] = useState<AccessPointDevice[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(false);
    const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
    const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

    // Active tab
    const [activeTab, setActiveTab] = useState<'devices'>('devices');

    // Remote door control
    const [unlockSeconds, setUnlockSeconds] = useState(3);
    const [doorCommandInFlight, setDoorCommandInFlight] = useState<string | null>(null);
    // null = no hold; 'open' = hold_open active; 'close' = hold_close active.
    // The two modes are mutually exclusive on the device, so a single field
    // captures the state cleanly.
    const [doorHoldMode, setDoorHoldMode] = useState<null | 'open' | 'close'>(null);
    const [confirmHoldOpen, setConfirmHoldOpen] = useState(false);
    const [confirmHoldClose, setConfirmHoldClose] = useState(false);

    // Edit modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', zone_id: '', map_x: '', map_y: '', map_rotation: '', map_label: '' });
    const [editNameError, setEditNameError] = useState('');
    const [submittingEdit, setSubmittingEdit] = useState(false);
    const [zones, setZones] = useState<{ id: string; name: string }[]>([]);

    // ── Fetch AP details ────────────────────────────────────────────────────

    const fetchAP = useCallback(async () => {
        if (!id) return;
        setAPLoading(true);
        try {
            const data = await apiFetch<AccessPoint | { access_point: AccessPoint }>(`/api/v1/access/access-points/${id}`);
            // handle both flat and wrapped responses
            setAP('access_point' in (data as object) ? (data as { access_point: AccessPoint }).access_point : (data as AccessPoint));
        } catch (err) {
            console.error('Failed to fetch access point:', err);
            setError(err instanceof Error ? err.message : 'Failed to load access point');
        } finally {
            setAPLoading(false);
        }
    }, [id]);

    // ── Fetch devices ───────────────────────────────────────────────────────

    const fetchDevices = useCallback(async () => {
        if (!id) return;
        setDevicesLoading(true);
        try {
            const [linkedRes, gatewayRes] = await Promise.all([
                apiFetch<{ data?: AccessPointDevice[] }>(`/api/v1/access/access-points/${id}/devices`),
                apiFetch<{ id: string; name: string; type: string; status: string; device_id?: string }[]>('/api/v1/gateway/devices?limit=500'),
            ]);
            const linked = linkedRes.data ?? [];
            const gatewayMap = new Map((Array.isArray(gatewayRes) ? gatewayRes : []).map((d) => [d.id, d]));
            setDevices(linked.map((item) => {
                const gw = gatewayMap.get(item.access_device_id);
                return {
                    ...item,
                    device: gw ? { id: gw.id, name: gw.name || gw.device_id || item.access_device_id, type: gw.type, status: gw.status, state: '' } : undefined,
                };
            }));
        } catch (err) {
            console.error('Failed to fetch devices:', err);
            setError(err instanceof Error ? err.message : 'Failed to load devices');
        } finally {
            setDevicesLoading(false);
        }
    }, [id]);

    // ── Remote door control ────────────────────────────────────────────────

    const onlineDeviceCount = useMemo(
        () => devices.filter((d) => d.device?.status === 'online').length,
        [devices],
    );
    const offlineDeviceCount = devices.length - onlineDeviceCount;

    const sendDoorCommand = useCallback(
        async (action: 'unlock' | 'lock' | 'hold_open' | 'hold_close' | 'release', durationMs?: number) => {
            if (!id) return;
            setDoorCommandInFlight(action);
            try {
                const body: Record<string, unknown> = { action, reason: 'remote_command' };
                if (durationMs != null) body.duration_ms = durationMs;
                await apiFetch(`/api/v1/gateway/access-points/${id}/door-command`, {
                    method: 'POST',
                    body: JSON.stringify(body),
                });
                if (action === 'hold_open') setDoorHoldMode('open');
                else if (action === 'hold_close') setDoorHoldMode('close');
                else if (action === 'release' || action === 'lock') setDoorHoldMode(null);
                const toastMsg: Record<typeof action, string> = {
                    unlock: t('door.toast.unlocked', 'Door unlocked for {{s}}s', { s: (durationMs ?? unlockSeconds * 1000) / 1000 }),
                    lock: t('door.toast.locked', 'Door locked'),
                    hold_open: t('door.toast.heldOpen', 'Door held open'),
                    hold_close: t('door.toast.heldClosed', 'Door held closed'),
                    release: t('door.toast.released', 'Hold released'),
                };
                toast(toastMsg[action], 'success');
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Door command failed';
                // The backend returns 409 + structured body when any device is offline;
                // surface a friendlier message in that case.
                if (message.includes('409')) {
                    toast(t('door.toast.offline', 'One or more devices are offline; command aborted'), 'error');
                } else {
                    toast(message, 'error');
                }
            } finally {
                setDoorCommandInFlight(null);
            }
        },
        [id, t, unlockSeconds],
    );

    const handleAddDevice = useCallback(
        async (access_device_ids: string[], role: string): Promise<boolean> => {
            if (!id) return false;
            try {
                await Promise.all(
                    access_device_ids.map((access_device_id) =>
                        apiFetch(`/api/v1/access/access-points/${id}/devices`, {
                            method: 'POST',
                            body: JSON.stringify({ access_device_id, role }),
                        }),
                    ),
                );
                setError(null);
                await fetchDevices();
                await fetchAP();
                toast(t('toast.deviceAdded', { count: access_device_ids.length }), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to add device';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [id, fetchDevices, fetchAP],
    );

    const handleRemoveDevice = useCallback(
        async (deviceId: string) => {
            if (!id) return;
            setRemovingDeviceId(deviceId);
            try {
                await apiFetch(`/api/v1/access/access-points/${id}/devices/${deviceId}`, {
                    method: 'DELETE',
                });
                setError(null);
                await fetchDevices();
                await fetchAP();
                toast(t('toast.deviceRemoved'), 'success');
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to remove device';
                setError(message);
                toast(message, 'error');
            } finally {
                setRemovingDeviceId(null);
            }
        },
        [id, fetchDevices, fetchAP],
    );

    // ── Initial load ────────────────────────────────────────────────────────

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            await Promise.all([fetchAP(), fetchDevices()]);
        };
        if (!cancelled) run();
        return () => { cancelled = true; };
    }, [fetchAP, fetchDevices]);

    // ── Edit handlers ───────────────────────────────────────────────────────

    const openEditModal = useCallback(() => {
        if (!ap) return;
        setEditForm({
            name: ap.name,
            description: ap.description ?? '',
            zone_id: ap.zone_id ?? '',
            map_x: ap.map_x?.toString() ?? '',
            map_y: ap.map_y?.toString() ?? '',
            map_rotation: ap.map_rotation?.toString() ?? '',
            map_label: ap.map_label ?? '',
        });
        setEditNameError('');
        // load zones lazily
        apiFetch<{ data?: { id: string; name: string }[] }>('/api/v1/access/zones?limit=200')
            .then((zRes) => {
                setZones(zRes.data ?? []);
            })
            .catch(() => {});
        setShowEditModal(true);
    }, [ap]);

    const handleEditSubmit = useCallback(async () => {
        if (!id || !ap) return;
        if (!editForm.name.trim()) {
            setEditNameError(t('validation.nameRequired', 'Name is required'));
            return;
        }
        setSubmittingEdit(true);
        try {
            const payload: Record<string, string | number | undefined> = {
                name: editForm.name.trim(),
                description: editForm.description.trim() || undefined,
                zone_id: editForm.zone_id || undefined,
                map_x: editForm.map_x === '' ? undefined : Number(editForm.map_x),
                map_y: editForm.map_y === '' ? undefined : Number(editForm.map_y),
                map_rotation: editForm.map_rotation === '' ? undefined : Number(editForm.map_rotation),
                map_label: editForm.map_label.trim() || undefined,
            };
            await apiFetch(`/api/v1/access/access-points/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            await fetchAP();
            setShowEditModal(false);
            toast(t('toast.updated'), 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update access point';
            setError(message);
            toast(message, 'error');
        } finally {
            setSubmittingEdit(false);
        }
    }, [id, ap, editForm, fetchAP, t]);

    // ── Column definitions ──────────────────────────────────────────────────

    const deviceColumns = useMemo(
        (): Column<AccessPointDevice>[] => [
            {
                key: 'device_name',
                header: t('deviceName', 'Device Name'),
                render: (d) => <span className="text-[13px] font-medium">{d.device?.name ?? d.access_device_id}</span>,
            },
            {
                key: 'device_type',
                header: t('deviceType', 'Type'),
                render: (d) =>
                    d.device?.type ? <Badge variant="outline">{d.device.type}</Badge> : <span className="text-[12px] text-muted-foreground">—</span>,
            },
            {
                key: 'role',
                header: t('role', 'Role'),
                render: (d) => <Badge variant={roleBadgeVariant(d.role)}>{roleLabel(d.role)}</Badge>,
            },
            {
                key: 'device_status',
                header: t('status', 'Status'),
                render: (d) => <DeviceStatusBadge status={d.device?.status} />,
            },
            {
                key: 'actions',
                header: t('common:table.actions'),
                width: '80px',
                render: (d) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[12px] text-destructive hover:text-destructive"
                        onClick={() => handleRemoveDevice(d.access_device_id)}
                        disabled={removingDeviceId === d.access_device_id}
                    >
                        <Trash2 size={13} className="mr-1" />
                        {removingDeviceId === d.access_device_id ? t('removing', 'Removing…') : t('remove', 'Remove')}
                    </Button>
                ),
            },
        ],
        [t, handleRemoveDevice, removingDeviceId],
    );

    // ── Render ──────────────────────────────────────────────────────────────

    if (apLoading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
        );
    }

    if (!ap) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Shield size={36} className="opacity-40" />
                <p className="text-[14px]">{t('notFound', 'Access point not found')}</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/access/access-points')}>
                    <ArrowLeft size={14} className="mr-1.5" />
                    {t('backToList', 'Back to Access Points')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Error banner */}
            {error && (
                <div className="text-red-500 text-sm p-2 mb-2 bg-red-50 rounded shrink-0">{error}</div>
            )}

            {/* Page header — matches AccessGroupDetailPage layout */}
            <div className="shrink-0">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate('/access/access-points')}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground mb-3 px-0 h-auto"
                >
                    <ArrowLeft size={13} />
                    {t('backToList', 'Access Points')}
                </Button>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Shield size={20} className="text-primary shrink-0" />
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-[18px] font-semibold text-foreground">{ap.name}</h1>
                            </div>
                            {ap.description && (
                                <p className="text-[12px] text-muted-foreground mt-0.5">{ap.description}</p>
                            )}
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={openEditModal}>
                        <Edit size={14} className="mr-1.5" />
                        {t('edit', 'Edit')}
                    </Button>
                </div>
            </div>

            {/* Remote door control */}
            <div className="shrink-0 rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                            <DoorOpen size={14} className="text-primary" />
                            {t('door.title', 'Remote door control')}
                        </h2>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {devices.length === 0
                                ? t('door.noDevices', 'No devices linked to this access point')
                                : offlineDeviceCount > 0
                                    ? t('door.offline', '{{offline}} of {{total}} device(s) offline — commands disabled', { offline: offlineDeviceCount, total: devices.length })
                                    : t('door.ready', '{{count}} device(s) online and ready', { count: onlineDeviceCount })}
                        </p>
                    </div>
                    {doorHoldMode === 'open' && (
                        <Badge variant="outline" className="border-amber-400 text-amber-500">
                            {t('door.holdOpenActive', 'Hold open active')}
                        </Badge>
                    )}
                    {doorHoldMode === 'close' && (
                        <Badge variant="outline" className="border-rose-400 text-rose-500">
                            {t('door.holdCloseActive', 'Hold closed active')}
                        </Badge>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Label htmlFor="ap-unlock-seconds" className="text-[11px] text-muted-foreground">
                            {t('door.duration', 'Duration (s)')}
                        </Label>
                        <Input
                            id="ap-unlock-seconds"
                            type="number"
                            min={1}
                            max={60}
                            value={unlockSeconds}
                            onChange={(e) => setUnlockSeconds(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
                            className="h-8 w-16 text-[12px]"
                            disabled={doorCommandInFlight != null || devices.length === 0 || offlineDeviceCount > 0}
                        />
                    </div>

                    <Button
                        size="sm"
                        onClick={() => sendDoorCommand('unlock', unlockSeconds * 1000)}
                        disabled={doorCommandInFlight != null || devices.length === 0 || offlineDeviceCount > 0 || doorHoldMode !== null}
                        data-testid="access-button-doorUnlock"
                    >
                        <Unlock size={14} className="mr-1.5" />
                        {doorCommandInFlight === 'unlock' ? t('door.sending', 'Sending…') : t('door.unlock', 'Unlock')}
                    </Button>

                    {doorHoldMode === 'open' ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendDoorCommand('release')}
                            disabled={doorCommandInFlight != null}
                            data-testid="access-button-doorRelease"
                        >
                            <DoorClosed size={14} className="mr-1.5" />
                            {doorCommandInFlight === 'release' ? t('door.sending', 'Sending…') : t('door.release', 'Release')}
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmHoldOpen(true)}
                            disabled={doorCommandInFlight != null || devices.length === 0 || offlineDeviceCount > 0 || doorHoldMode === 'close'}
                            data-testid="access-button-doorHoldOpen"
                        >
                            <DoorOpen size={14} className="mr-1.5" />
                            {t('door.holdOpen', 'Hold open')}
                        </Button>
                    )}

                    {doorHoldMode === 'close' ? (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendDoorCommand('release')}
                            disabled={doorCommandInFlight != null}
                            data-testid="access-button-doorReleaseClose"
                        >
                            <DoorOpen size={14} className="mr-1.5" />
                            {doorCommandInFlight === 'release' ? t('door.sending', 'Sending…') : t('door.release', 'Release')}
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmHoldClose(true)}
                            disabled={doorCommandInFlight != null || devices.length === 0 || offlineDeviceCount > 0 || doorHoldMode === 'open'}
                            data-testid="access-button-doorHoldClose"
                        >
                            <DoorClosed size={14} className="mr-1.5" />
                            {t('door.holdClose', 'Hold closed')}
                        </Button>
                    )}

                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendDoorCommand('lock')}
                        disabled={doorCommandInFlight != null || devices.length === 0 || offlineDeviceCount > 0 || doorHoldMode !== null}
                        data-testid="access-button-doorLock"
                    >
                        <Lock size={14} className="mr-1.5" />
                        {doorCommandInFlight === 'lock' ? t('door.sending', 'Sending…') : t('door.lock', 'Lock')}
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'devices')}
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
                {/* Card header: tabs + action button */}
                <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
                    <TabsList variant="line">
                        <TabsTrigger value="devices" className="text-[12px] px-3 whitespace-nowrap">
                            <Cpu size={13} className="mr-1.5" />
                            {t('devicesTab', 'Devices')} ({devices.length})
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === 'devices' && (
                        <Button size="sm" onClick={() => setShowAddDeviceModal(true)}>
                            <Plus size={14} className="mr-1.5" />
                            {t('addDevice', 'Add Device')}
                        </Button>
                    )}
                </div>

                {/* Devices tab content */}
                <TabsContent value="devices" className="min-h-0 flex-1 overflow-auto">
                    {devicesLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        </div>
                    ) : devices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Cpu size={36} className="mb-3 text-muted-foreground/40" />
                            <p className="text-[13px] font-medium text-foreground">{t('noDevicesTitle', 'No devices linked')}</p>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                {t('noDevicesHint', 'Click "Add Device" to link a device to this access point.')}
                            </p>
                        </div>
                    ) : (
                        <DataTable embedded stickyHeader paginate={false} columns={deviceColumns} data={devices} rowKey={(d) => d.id} />
                    )}
                </TabsContent>
            </Tabs>

            {/* Add Device Modal */}
            <AddDeviceModal
                open={showAddDeviceModal}
                onOpenChange={setShowAddDeviceModal}
                linkedDeviceIds={devices.map((d) => d.access_device_id)}
                onSubmit={handleAddDevice}
            />

            {/* Edit Access Point Modal */}
            <AppModal
                open={showEditModal}
                onOpenChange={(v) => {
                    if (!v) setShowEditModal(false);
                }}
                title={
                    <span className="flex items-center gap-2">
                        <Edit size={16} className="text-primary" />
                        {t('editTitle', 'Edit Access Point')}
                    </span>
                }
                size="sm"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: submittingEdit ? t('saving', 'Saving…') : t('save', 'Save'),
                    onClick: handleEditSubmit,
                    disabled: submittingEdit,
                    loading: submittingEdit,
                }}
            >
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="edit-ap-name">{t('name', 'Name')} *</Label>
                        <Input
                            id="edit-ap-name"
                            value={editForm.name}
                            onChange={(e) => {
                                setEditForm((p) => ({ ...p, name: e.target.value }));
                                setEditNameError('');
                            }}
                            placeholder={t('namePlaceholder', 'e.g. Main Entrance')}
                            className={editNameError ? 'border-destructive' : ''}
                            disabled={submittingEdit}
                        />
                        {editNameError && <p className="mt-1 text-[11px] text-destructive">{editNameError}</p>}
                    </div>
                    <div>
                        <Label htmlFor="edit-ap-desc">{t('description', 'Description')}</Label>
                        <Input
                            id="edit-ap-desc"
                            value={editForm.description}
                            onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                            placeholder={t('descriptionPlaceholder', 'Optional description')}
                            disabled={submittingEdit}
                        />
                    </div>
                    <div>
                        <Label>{t('zone', 'Zone')}</Label>
                        <Select
                            value={editForm.zone_id}
                            onValueChange={(v) => setEditForm((p) => ({ ...p, zone_id: v }))}
                            placeholder={t('noZone', '— No zone —')}
                            disabled={submittingEdit}
                        >
                            <SelectOption value="">{t('noZone', '— No zone —')}</SelectOption>
                            {zones.map((z) => (
                                <SelectOption key={z.id} value={z.id}>
                                    {z.name}
                                </SelectOption>
                            ))}
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="edit-ap-map-x">Map X</Label>
                            <Input id="edit-ap-map-x" value={editForm.map_x} onChange={(e) => setEditForm((p) => ({ ...p, map_x: e.target.value }))} disabled={submittingEdit} />
                        </div>
                        <div>
                            <Label htmlFor="edit-ap-map-y">Map Y</Label>
                            <Input id="edit-ap-map-y" value={editForm.map_y} onChange={(e) => setEditForm((p) => ({ ...p, map_y: e.target.value }))} disabled={submittingEdit} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="edit-ap-map-rotation">Rotation</Label>
                            <Input id="edit-ap-map-rotation" value={editForm.map_rotation} onChange={(e) => setEditForm((p) => ({ ...p, map_rotation: e.target.value }))} disabled={submittingEdit} />
                        </div>
                        <div>
                            <Label htmlFor="edit-ap-map-label">Map Label</Label>
                            <Input id="edit-ap-map-label" value={editForm.map_label} onChange={(e) => setEditForm((p) => ({ ...p, map_label: e.target.value }))} disabled={submittingEdit} />
                        </div>
                    </div>
                </div>
            </AppModal>

            {/* Hold-open confirmation */}
            <AppModal
                open={confirmHoldOpen}
                onOpenChange={setConfirmHoldOpen}
                title={t('door.confirmHoldTitle', 'Hold door open?')}
                footer={(
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmHoldOpen(false)}>
                            {t('cancel', 'Cancel')}
                        </Button>
                        <Button
                            size="sm"
                            onClick={async () => {
                                setConfirmHoldOpen(false);
                                await sendDoorCommand('hold_open');
                            }}
                            disabled={doorCommandInFlight != null}
                        >
                            {t('door.confirmHoldAction', 'Hold open')}
                        </Button>
                    </div>
                )}
            >
                <p className="text-[12px] text-muted-foreground">
                    {t('door.confirmHoldBody', 'This keeps the door unlocked until someone clicks Release. Use only when you need continuous access.')}
                </p>
            </AppModal>

            {/* Hold-closed confirmation */}
            <AppModal
                open={confirmHoldClose}
                onOpenChange={setConfirmHoldClose}
                title={t('door.confirmHoldCloseTitle', 'Hold door closed?')}
                footer={(
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => setConfirmHoldClose(false)}>
                            {t('cancel', 'Cancel')}
                        </Button>
                        <Button
                            size="sm"
                            onClick={async () => {
                                setConfirmHoldClose(false);
                                await sendDoorCommand('hold_close');
                            }}
                            disabled={doorCommandInFlight != null}
                        >
                            {t('door.confirmHoldCloseAction', 'Hold closed')}
                        </Button>
                    </div>
                )}
            >
                <p className="text-[12px] text-muted-foreground">
                    {t('door.confirmHoldCloseBody', 'This keeps the door locked and refuses every credential read until someone clicks Release. Use for lockdown or emergency closure.')}
                </p>
            </AppModal>
        </div>
    );
}
