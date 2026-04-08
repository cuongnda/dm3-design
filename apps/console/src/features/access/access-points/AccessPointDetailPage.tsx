import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Shield, Plus, Trash2, DoorOpen, Users, Edit } from 'lucide-react';
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
import type { AccessPoint, AccessPointDevice } from './types';

// ---------------------------------------------------------------------------
// Types local to this page
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Add Door Modal
// ---------------------------------------------------------------------------

const DOOR_ROLES = [
    { value: 'reader_in', label: 'Reader In' },
    { value: 'reader_out', label: 'Reader Out' },
    { value: 'controller', label: 'Controller' },
    { value: 'camera', label: 'Camera' },
] as const;

interface AvailableDoor {
    id: string;
    name: string;
    type?: string;
    status?: string;
}

interface AddDoorModalProps {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    linkedDoorIds: string[];
    onSubmit: (access_device_ids: string[], role: string) => Promise<boolean>;
}

function AddDoorModal({ open, onOpenChange, linkedDoorIds, onSubmit }: AddDoorModalProps) {
    const { t } = useTranslation('accessPoints');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [role, setRole] = useState('reader_in');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [allDoors, setAllDoors] = useState<AvailableDoor[]>([]);
    const [loadingDoors, setLoadingDoors] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;

    useEffect(() => {
        if (!open) return;
        setLoadingDoors(true);
        apiFetch<{ data?: AvailableDoor[] }>('/api/v1/access/access-devices?limit=200')
            .then((res) => setAllDoors(res.data ?? []))
            .catch(() => setAllDoors([]))
            .finally(() => setLoadingDoors(false));
    }, [open]);

    const availableDoors = useMemo(() => allDoors.filter((d) => !linkedDoorIds.includes(d.id)), [allDoors, linkedDoorIds]);

    const filteredDoors = useMemo(() => {
        const q = search.toLowerCase();
        return q ? availableDoors.filter((d) => d.name.toLowerCase().includes(q) || d.type?.toLowerCase().includes(q)) : availableDoors;
    }, [availableDoors, search]);

    // Reset to page 1 when search or available doors change
    useEffect(() => {
        setPage(1);
    }, [search, availableDoors.length]);

    const totalPages = Math.max(1, Math.ceil(filteredDoors.length / PAGE_SIZE));
    const pagedDoors = filteredDoors.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const allFilteredSelected = filteredDoors.length > 0 && filteredDoors.every((d) => selected.has(d.id));
    const someFilteredSelected = filteredDoors.some((d) => selected.has(d.id));

    const toggleAll = () => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (allFilteredSelected) {
                filteredDoors.forEach((d) => next.delete(d.id));
            } else {
                filteredDoors.forEach((d) => next.add(d.id));
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
            setRole('reader_in');
            setError('');
            setSearch('');
            setPage(1);
        }
        onOpenChange(v);
    };

    const handleSubmit = async () => {
        if (selected.size === 0) {
            setError(t('selectDoorRequired'));
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
                    <DoorOpen size={16} />
                    {t('addDoor', 'Add Door')}
                </span>
            }
            size="md"
            showCancelButton
            cancelLabel={t('cancel', 'Cancel')}
            errorMessage={error || undefined}
            primaryAction={{
                label: submitting ? t('adding') : selected.size > 0 ? t('addNDoors', { count: selected.size }) : t('add'),
                onClick: handleSubmit,
                disabled: submitting || selected.size === 0,
                loading: submitting,
            }}
        >
            <div className="space-y-3">
                {/* Role selector */}
                <div className="flex items-center gap-3">
                    <Label className="shrink-0">{t('role')}</Label>
                    <Select value={role} onValueChange={setRole} disabled={submitting} className="w-44">
                        {DOOR_ROLES.map((r) => (
                            <SelectOption key={r.value} value={r.value}>
                                {r.label}
                            </SelectOption>
                        ))}
                    </Select>
                </div>

                {/* Search */}
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('searchDoors')}
                    className="h-8 text-[13px]"
                    disabled={submitting}
                />

                {/* Door table */}
                <div className="rounded-md border border-border overflow-hidden">
                    {loadingDoors ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                            Loading…
                        </div>
                    ) : availableDoors.length === 0 ? (
                        <div className="py-10 text-center text-[13px] text-muted-foreground">
                            {allDoors.length === 0 ? t('noDoorsInSystem') : t('allDoorsAssigned')}
                        </div>
                    ) : filteredDoors.length === 0 ? (
                        <div className="py-10 text-center text-[13px] text-muted-foreground">{t('noDoorsMatch')}</div>
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
                                        <th className="px-3 py-2 text-left font-medium text-foreground">{t('doorName')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-foreground">{t('doorType')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-foreground">{t('status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagedDoors.map((d) => (
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
                                            <td className="px-3 py-2 font-medium text-foreground">{d.name}</td>
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
                                                <DoorStatusBadge status={d.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <TablePaginationFooter
                                page={page}
                                pageSize={PAGE_SIZE}
                                total={filteredDoors.length}
                                totalPages={totalPages}
                                onPageChange={setPage}
                                loading={loadingDoors}
                                className="border-t border-border"
                            />
                        </>
                    )}
                </div>

                {selected.size > 0 && <p className="text-[12px] text-muted-foreground">{t('doorsSelected', { count: selected.size })}</p>}
            </div>
        </AppModal>
    );
}

// ---------------------------------------------------------------------------
// Add Access Group Modal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Door status badge helper
// ---------------------------------------------------------------------------

function DoorStatusBadge({ status }: { status?: string }) {
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
    return DOOR_ROLES.find((r) => r.value === role)?.label ?? role;
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

    // Doors tab
    const [doors, setDoors] = useState<AccessPointDevice[]>([]);
    const [doorsLoading, setDoorsLoading] = useState(false);
    const [showAddDoorModal, setShowAddDoorModal] = useState(false);
    const [removingDoorId, setRemovingDoorId] = useState<string | null>(null);

    // Active tab
    const [activeTab, setActiveTab] = useState<'doors'>('doors');

    // Edit modal
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', zone_id: '' });
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
        } finally {
            setAPLoading(false);
        }
    }, [id]);

    // ── Fetch doors ─────────────────────────────────────────────────────────

    const fetchDoors = useCallback(async () => {
        if (!id) return;
        setDoorsLoading(true);
        try {
            const data = await apiFetch<{ doors?: AccessPointDevice[]; data?: AccessPointDevice[] }>(`/api/v1/access/access-points/${id}/doors`);
            setDoors(data.doors ?? data.data ?? (data as unknown as AccessPointDevice[]));
        } catch (err) {
            console.error('Failed to fetch doors:', err);
        } finally {
            setDoorsLoading(false);
        }
    }, [id]);

    const handleAddDoor = useCallback(
        async (access_device_ids: string[], role: string): Promise<boolean> => {
            if (!id) return false;
            try {
                await Promise.all(
                    access_device_ids.map((access_device_id) =>
                        apiFetch(`/api/v1/access/access-points/${id}/doors`, {
                            method: 'POST',
                            body: JSON.stringify({ access_device_id, role }),
                        }),
                    ),
                );
                await fetchDoors();
                await fetchAP();
                return true;
            } catch (err) {
                console.error('Failed to add door:', err);
                return false;
            }
        },
        [id, fetchDoors, fetchAP],
    );

    const handleRemoveDoor = useCallback(
        async (doorId: string) => {
            if (!id) return;
            setRemovingDoorId(doorId);
            try {
                await apiFetch(`/api/v1/access/access-points/${id}/doors/${doorId}`, {
                    method: 'DELETE',
                });
                await fetchDoors();
                await fetchAP();
            } catch (err) {
                console.error('Failed to remove door:', err);
            } finally {
                setRemovingDoorId(null);
            }
        },
        [id, fetchDoors, fetchAP],
    );

    // ── Initial load ────────────────────────────────────────────────────────

    useEffect(() => {
        fetchAP();
        fetchDoors();
    }, [fetchAP, fetchDoors]);

    // ── Edit handlers ───────────────────────────────────────────────────────

    const openEditModal = useCallback(() => {
        if (!ap) return;
        setEditForm({
            name: ap.name,
            description: ap.description ?? '',
            zone_id: ap.zone_id ?? '',
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
            const payload: Record<string, string | undefined> = {
                name: editForm.name.trim(),
                description: editForm.description.trim() || undefined,
                zone_id: editForm.zone_id || undefined,
            };
            await apiFetch(`/api/v1/access/access-points/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            await fetchAP();
            setShowEditModal(false);
        } catch (err) {
            console.error('Failed to update access point:', err);
        } finally {
            setSubmittingEdit(false);
        }
    }, [id, ap, editForm, fetchAP, t]);

    // ── Column definitions ──────────────────────────────────────────────────

    const doorColumns = useMemo(
        (): Column<AccessPointDevice>[] => [
            {
                key: 'door_name',
                header: t('doorName', 'Door Name'),
                render: (d) => <span className="text-[13px] font-medium">{d.device?.name ?? d.access_device_id}</span>,
            },
            {
                key: 'door_type',
                header: t('doorType', 'Type'),
                render: (d) =>
                    d.device?.type ? <Badge variant="outline">{d.device.type}</Badge> : <span className="text-[12px] text-muted-foreground">—</span>,
            },
            {
                key: 'role',
                header: t('role', 'Role'),
                render: (d) => <Badge variant={roleBadgeVariant(d.role)}>{roleLabel(d.role)}</Badge>,
            },
            {
                key: 'door_status',
                header: t('status', 'Status'),
                render: (d) => <DoorStatusBadge status={d.device?.status} />,
            },
            {
                key: 'actions',
                header: '',
                width: '80px',
                render: (d) => (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-[12px] text-destructive hover:text-destructive"
                        onClick={() => handleRemoveDoor(d.access_device_id)}
                        disabled={removingDoorId === d.access_device_id}
                    >
                        <Trash2 size={13} className="mr-1" />
                        {removingDoorId === d.access_device_id ? t('removing', 'Removing…') : t('remove', 'Remove')}
                    </Button>
                ),
            },
        ],
        [t, handleRemoveDoor, removingDoorId],
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
            {/* Page header */}
            <div className="flex shrink-0 items-start justify-between">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="sm" className="mt-0.5 shrink-0" onClick={() => navigate('/access/access-points')}>
                        <ArrowLeft size={14} className="mr-1.5" />
                        {t('backToList', 'Access Points')}
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <Shield size={18} className="text-primary" />
                            <h1 className="text-[18px] font-semibold text-foreground">{ap.name}</h1>
                        </div>
                        {ap.description && <p className="mt-0.5 text-[13px] text-muted-foreground">{ap.description}</p>}
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={openEditModal}>
                    <Edit size={14} className="mr-1.5" />
                    {t('edit', 'Edit')}
                </Button>
            </div>

            {/* Tabs */}
            <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as 'doors')}
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
                {/* Card header: tabs + action button */}
                <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
                    <TabsList variant="line">
                        <TabsTrigger value="doors" className="text-[12px] px-3 whitespace-nowrap">
                            <DoorOpen size={13} className="mr-1.5" />
                            {t('doorsTab', 'Doors')} ({doors.length})
                        </TabsTrigger>
                    </TabsList>

                    {activeTab === 'doors' && (
                        <Button size="sm" onClick={() => setShowAddDoorModal(true)}>
                            <Plus size={14} className="mr-1.5" />
                            {t('addDoor', 'Add Door')}
                        </Button>
                    )}
                </div>

                {/* Doors tab content */}
                <TabsContent value="doors" className="min-h-0 flex-1 overflow-auto">
                    {doorsLoading ? (
                        <div className="flex justify-center py-12">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                        </div>
                    ) : doors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <DoorOpen size={36} className="mb-3 text-muted-foreground/40" />
                            <p className="text-[13px] font-medium text-foreground">{t('noDoorsTitle', 'No doors linked')}</p>
                            <p className="mt-1 text-[12px] text-muted-foreground">
                                {t('noDoorsHint', 'Click "Add Door" to link a door to this access point.')}
                            </p>
                        </div>
                    ) : (
                        <DataTable embedded stickyHeader paginate={false} columns={doorColumns} data={doors} rowKey={(d) => d.id} />
                    )}
                </TabsContent>
            </Tabs>

            {/* Add Door Modal */}
            <AddDoorModal
                open={showAddDoorModal}
                onOpenChange={setShowAddDoorModal}
                linkedDoorIds={doors.map((d) => d.access_device_id)}
                onSubmit={handleAddDoor}
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
                </div>
            </AppModal>
        </div>
    );
}
