import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Shield, Plus, Search, MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
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
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessGroups } from './hooks/useAccessGroups';
import type { AccessGroup, AccessGroupFormData } from './types';

export function AccessGroupsPage() {
    const { t } = useTranslation('accessGroups');
    const navigate = useNavigate();

    const {
        accessGroups,
        loading,
        pagination,
        fetchAccessGroups,
        createAccessGroup,
        updateAccessGroup,
        deleteAccessGroup,
        changePage,
        changePageSize,
    } = useAccessGroups();

    const [search, setSearch] = useState('');
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

    const filteredGroups = useMemo(() => {
        if (!search.trim()) return accessGroups;
        const q = search.toLowerCase();
        return accessGroups.filter((g) => g.name.toLowerCase().includes(q));
    }, [accessGroups, search]);

    const openCreateModal = () => {
        setFormData({ name: '', is_default: false });
        setFormError('');
        setShowCreateModal(true);
    };

    const openEditModal = (group: AccessGroup) => {
        setFormData({ name: group.name, is_default: group.is_default });
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
            await apiFetch(`/api/v1/access/access-groups/${groupToDelete.id}`, { method: 'DELETE' });
            setShowDeleteDialog(false);
            setGroupToDelete(null);
            fetchAccessGroups();
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
        [navigate, t],
    );

    const GroupFormContent = (
        <div className="flex flex-col gap-4">
            <div>
                <Label htmlFor="group-name">
                    {t('form.name', 'Name')} <span className="text-destructive">*</span>
                </Label>
                <Input
                    id="group-name"
                    value={formData.name}
                    onChange={(e) => {
                        setFormData((prev) => ({ ...prev, name: e.target.value }));
                        setFormError('');
                    }}
                    placeholder={t('form.namePlaceholder', 'Group name')}
                />
                {formError && <p className="text-[12px] text-destructive mt-1">{formError}</p>}
            </div>
            <div className="flex items-center gap-2">
                <input
                    id="is_default"
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
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Access Groups')}</h1>
                    <p className="text-[13px] text-muted-foreground">{t('description', 'Manage access groups and their assigned access points')}</p>
                </div>
                <Button size="sm" onClick={openCreateModal}>
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
                    />
                </div>
            </div>

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
                ) : filteredGroups.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-muted-foreground">
                        {search ? t('noResults', 'No access groups match your search') : t('empty', 'No access groups yet. Create the first one.')}
                    </div>
                ) : (
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        columns={columns}
                        data={filteredGroups}
                        rowKey={(g) => g.id}
                        onRowDoubleClick={(g) => navigate(`/access/access-groups/${g.id}`)}
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
    );
}
