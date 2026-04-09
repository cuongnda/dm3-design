import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Search, MoreHorizontal, Eye, Edit, Trash2, Clock } from 'lucide-react';
import {
    Button,
    Input,
    Label,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Badge,
    AppModal,
    DataTableCard,
    DataTable,
    type Column,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessGroups } from './hooks/useAccessGroups';
import type { AccessGroup, AccessGroupFormData, AccessTime } from './types';

export function AccessGroupsPage() {
    const { t } = useTranslation('accessGroups');
    const navigate = useNavigate();

    const {
        accessGroups,
        loading,
        pagination,
        search,
        setSearch,
        fetchAccessGroups,
        createAccessGroup,
        updateAccessGroup,
        deleteAccessGroup,
        changePage,
        changePageSize,
    } = useAccessGroups();

    const [selected, setSelected] = useState<string[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingGroup, setEditingGroup] = useState<AccessGroup | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<AccessGroup | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [formData, setFormData] = useState<AccessGroupFormData>({ name: '', is_default: false });
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [accessTimes, setAccessTimes] = useState<AccessTime[]>([]);

    // Fetch reference data for forms (with slots for tooltip display)
    useEffect(() => {
        apiFetch<{ data?: AccessTime[] }>('/api/v1/access/access-times?limit=100&include_slots=true')
            .then((res) => setAccessTimes(res.data ?? []))
            .catch(() => {});
    }, []);

    const accessTimeMap = useMemo(
        () => Object.fromEntries(accessTimes.map((at) => [at.id, at])),
        [accessTimes],
    );

    const openCreateModal = () => {
        setFormData({ name: '', is_default: false });
        setFormError('');
        setShowCreateModal(true);
    };

    const openEditModal = (group: AccessGroup) => {
        setFormData({ name: group.name, description: group.description, is_default: group.is_default, access_time_id: group.access_time_id });
        setFormError('');
        setEditingGroup(group);
    };

    const handleCreateSubmit = async () => {
        if (!formData.name.trim()) {
            setFormError(t('validation.nameRequired', 'Name is required'));
            return;
        }
        setSubmitting(true);
        const success = await createAccessGroup(formData);
        setSubmitting(false);
        if (success) setShowCreateModal(false);
    };

    const handleEditSubmit = async () => {
        if (!editingGroup) return;
        if (!formData.name.trim()) {
            setFormError(t('validation.nameRequired', 'Name is required'));
            return;
        }
        setSubmitting(true);
        const success = await updateAccessGroup(editingGroup.id, formData);
        setSubmitting(false);
        if (success) setEditingGroup(null);
    };

    const handleDeleteConfirm = async () => {
        if (!groupToDelete) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await deleteAccessGroup(groupToDelete.id);
            setShowDeleteDialog(false);
            setGroupToDelete(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete access group';
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
        setDeleteError(null);
        try {
            await apiFetch('/api/v1/access/access-groups/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
            setSelected([]);
            fetchAccessGroups();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Bulk delete failed');
        }
    };

    const columns = useMemo(
        (): Column<AccessGroup>[] => [
            {
                key: 'name',
                header: t('columns.name', 'Name'),
                sortable: true,
                render: (g) => (
                    <div className="flex items-center gap-2">
                        <Shield size={14} className="text-primary shrink-0" />
                        <span className="text-[13px] font-medium">{g.name}</span>
                        {g.is_default && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                Default
                            </Badge>
                        )}
                    </div>
                ),
            },
            {
                key: 'is_default',
                header: t('columns.default', 'Default'),
                width: '80px',
                render: (g) => (g.is_default ? <Badge variant="default">Yes</Badge> : <span className="text-[13px] text-muted-foreground">—</span>),
            },
            {
                key: 'access_point_count',
                header: t('columns.accessPoints', 'Access Points'),
                width: '110px',
                render: (g) => <Badge variant="secondary">{g.access_point_count ?? 0}</Badge>,
            },
            {
                key: 'user_count',
                header: t('columns.users', 'Users'),
                width: '72px',
                render: (g) => <Badge variant="outline">{g.user_count ?? 0}</Badge>,
            },
            {
                key: 'access_time',
                header: t('columns.accessTime', 'Access Time'),
                width: '160px',
                render: (g) => {
                    if (!g.access_time_id) return <span className="text-[13px] text-muted-foreground">24/7</span>;
                    const at = accessTimeMap[g.access_time_id];
                    if (!at) return <span className="text-[13px] text-muted-foreground">—</span>;
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                    const slots = at.slots?.filter((s) => s.is_active) ?? [];
                    return (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1.5 text-[13px] cursor-default">
                                    <Clock size={13} className="text-muted-foreground shrink-0" />
                                    <span className="truncate max-w-[120px]">{at.name}</span>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent side="bottom" className="max-w-[280px] p-3">
                                <p className="font-medium text-[12px] mb-1.5">{at.name}</p>
                                {slots.length === 0 ? (
                                    <p className="text-[11px] opacity-80">No active time slots</p>
                                ) : (
                                    <div className="space-y-0.5">
                                        {slots.map((s) => (
                                            <div key={s.id} className="text-[11px] flex justify-between gap-3">
                                                <span className="font-medium">{dayNames[s.day_of_week] ?? `Day ${s.day_of_week}`}</span>
                                                <span className="opacity-80">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </TooltipContent>
                        </Tooltip>
                    );
                },
            },
            {
                key: 'actions',
                header: '',
                width: '48px',
                render: (g) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    <MoreHorizontal size={14} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/access/access-groups/${g.id}`)}>
                                    <Eye size={14} className="mr-2" />
                                    View
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEditModal(g)}>
                                    <Edit size={14} className="mr-2" />
                                    Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setGroupToDelete(g);
                                        setShowDeleteDialog(true);
                                    }}
                                    className="text-destructive"
                                >
                                    <Trash2 size={14} className="mr-2" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
            },
        ],
        [navigate, t, accessTimeMap],
    );

    const GroupFormContent = (
        <div className="flex flex-col gap-4">
            <div>
                <Label htmlFor="group-name">
                    {t('form.name', 'Name')} <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="group-name"
                    data-testid="access-input-name"
                    value={formData.name}
                    onChange={(e) => {
                        setFormData((prev) => ({ ...prev, name: e.target.value }));
                        setFormError('');
                    }}
                    placeholder={t('form.namePlaceholder', 'Group name')}
                />
                {formError && <p className="text-[12px] text-destructive mt-1">{formError}</p>}
            </div>
            <div>
                <Label htmlFor="group-description">{t('form.description', 'Description')}</Label>
                <Input
                    id="group-description"
                    data-testid="access-input-description"
                    value={formData.description ?? ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value || undefined }))}
                    placeholder={t('form.descriptionPlaceholder', 'Optional description')}
                />
            </div>
            <div>
                <Label htmlFor="access-time">{t('form.accessTime', 'Access Time')}</Label>
                <select
                    id="access-time"
                    data-testid="access-select-accessTime"
                    value={formData.access_time_id ?? ''}
                    onChange={(e) => setFormData((prev) => ({ ...prev, access_time_id: e.target.value || undefined }))}
                    className="w-full h-9 px-3 py-1 text-[13px] border border-border rounded-md bg-input text-foreground appearance-none cursor-pointer"
                >
                    <option value="">{t('form.noRestriction', 'No time restriction (24/7)')}</option>
                    {accessTimes.map((at) => (
                        <option key={at.id} value={at.id}>{at.name}</option>
                    ))}
                </select>
            </div>
            <div className="flex items-center gap-2">
                <input
                    id="is_default"
                    data-testid="access-input-isDefault"
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={!!formData.is_default}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_default: e.target.checked }))}
                />
                <label htmlFor="is_default" className="text-[13px] text-foreground cursor-pointer select-none">
                    {t('form.isDefault', 'Set as default group')}
                </label>
            </div>
        </div>
    );

    return (
        <TooltipProvider>
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Access Groups')}</h1>
                    <p className="text-[13px] text-muted-foreground">{t('description', 'Manage access groups and their assigned access points')}</p>
                </div>
                <Button size="sm" onClick={openCreateModal} data-testid="access-button-create">
                    <Plus size={14} className="mr-1.5" />
                    {t('newGroup', 'New Group')}
                </Button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder={t('searchPlaceholder', 'Search access groups...')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                        data-testid="access-input-search"
                    />
                </div>
            </div>

            {/* Bulk delete error banner */}
            {deleteError && !showDeleteDialog && (
                <div className="text-red-500 text-sm p-2 bg-red-50 rounded shrink-0">{deleteError}</div>
            )}

            <DataTableCard
                title={
                    <span className="text-[14px] font-semibold">
                        {t('title', 'Access Groups')} ({pagination.total})
                    </span>
                }
                selectedCount={selected.length}
                onClearSelection={() => setSelected([])}
                onBulkDelete={handleBulkDelete}
                bulkDeleteLabel={`${selected.length} access groups`}
                pagination={{
                    page: pagination.page,
                    pageSize: pagination.limit,
                    total: pagination.total,
                    totalPages: pagination.total_pages,
                    pageSizeOptions: [10, 20, 50, 100],
                    onPageChange: changePage,
                    onPageSizeChange: changePageSize,
                    loading,
                }}
            >
                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                    </div>
                ) : accessGroups.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-muted-foreground">
                        {search ? t('noResults', 'No access groups match your search') : t('empty', 'No access groups yet. Create the first one.')}
                    </div>
                ) : (
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        columns={columns}
                        data={accessGroups}
                        rowKey={(g) => g.id}
                        onRowDoubleClick={(g) => navigate(`/access/access-groups/${g.id}`)}
                        data-testid="access-table-groups"
                        selection={{
                            selectedIds: selected,
                            onSelectedIdsChange: setSelected,
                            selectAllScope: 'page',
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
                        <Shield size={16} className="text-primary" />
                        {t('createGroup', 'New Access Group')}
                    </span>
                }
                size="sm"
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                primaryAction={{
                    label: submitting ? t('creating', 'Creating...') : t('create', 'Create'),
                    onClick: handleCreateSubmit,
                    disabled: submitting,
                }}
            >
                {GroupFormContent}
            </AppModal>

            {/* Edit Modal */}
            <AppModal
                open={!!editingGroup}
                onOpenChange={(open) => {
                    if (!open) setEditingGroup(null);
                }}
                title={
                    <span className="flex items-center gap-2">
                        <Edit size={16} className="text-primary" />
                        {t('editGroup', 'Edit Access Group')}
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
                {GroupFormContent}
            </AppModal>

            {/* Delete Confirmation */}
            <AppModal
                open={showDeleteDialog}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowDeleteDialog(false);
                        setGroupToDelete(null);
                        setDeleteError(null);
                    }
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('deleteGroup', 'Delete Access Group')}
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
                    <span className="font-medium text-foreground">"{groupToDelete?.name}"</span>?
                    {(groupToDelete?.user_count ?? 0) > 0 && (
                        <span className="block mt-2 text-destructive">
                            ⚠ {t('deleteWarningUsers', 'This group has {{count}} users assigned.', { count: groupToDelete?.user_count })}
                        </span>
                    )}
                </p>
            </AppModal>
        </div>
        </TooltipProvider>
    );
}
