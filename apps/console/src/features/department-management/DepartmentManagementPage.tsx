import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Building2, Plus, Edit, Trash2, Trash, Users } from 'lucide-react';
import {
    Button,
    Input,
    Badge,
    AppModal,
    DataTable,
    type Column,
    Card,
    TablePaginationFooter,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useDepartmentManagement } from './hooks/useDepartmentManagement';
import { DepartmentModal } from './components/DepartmentModal';
import { UserAssignModal } from './components/UserAssignModal';
import type { Department, DepartmentFormData } from './types';

export function DepartmentManagementPage() {
    const { t } = useTranslation('departments');
    const navigate = useNavigate();

    const {
        departments,
        loading,
        pagination,
        filters,
        sortBy,
        sortDir,
        fetchDepartments,
        createDepartment,
        updateDepartment,
        deleteDepartment,
        updateFilters,
        changePage,
        changePageSize,
        handleSortChange,
        fetchManagers,
    } = useDepartmentManagement();

    const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [departmentToDelete, setDepartmentToDelete] = useState<Department | null>(null);
    const [showUserAssignModal, setShowUserAssignModal] = useState(false);
    const [selectedDepartmentForUsers, setSelectedDepartmentForUsers] = useState<Department | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

    useEffect(() => {
        fetchDepartments();
        fetchManagers();
    }, [fetchDepartments, fetchManagers]);

    const handleCreateDepartment = async (data: DepartmentFormData) => {
        const success = await createDepartment(data);
        if (success) setShowCreateModal(false);
    };

    const handleEditDepartment = async (data: DepartmentFormData) => {
        if (!editingDepartment) return;
        const success = await updateDepartment(editingDepartment.id, data);
        if (success) setEditingDepartment(null);
    };

    const handleDeleteConfirm = async () => {
        if (!departmentToDelete) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await apiFetch(`/api/v1/identity/departments/${departmentToDelete.id}`, { method: 'DELETE' });
            setShowDeleteDialog(false);
            setDepartmentToDelete(null);
            fetchDepartments();
            toast(t('toast.deleted'), 'success');
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete department';
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
        if (selectedDepartments.length === 0) return;
        setBulkDeleteLoading(true);
        try {
            await apiFetch('/api/v1/identity/departments/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: selectedDepartments }),
            });
            toast(t('toast.bulkDeleted', { count: selectedDepartments.length }), 'success');
            setSelectedDepartments([]);
            setShowBulkDeleteDialog(false);
            fetchDepartments();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk delete failed';
            setDeleteError(message);
            toast(message, 'error');
        } finally {
            setBulkDeleteLoading(false);
        }
    };

    const deptColumns = useMemo(
        (): Column<Department>[] => [
            {
                key: 'name',
                header: t('col.department'),
                sortable: true,
                render: (d) => (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/manage/departments/${d.id}`); }}
                        className="flex items-center gap-2 text-left hover:text-primary"
                    >
                        <Building2 size={14} className="text-primary shrink-0" />
                        <div>
                            <div className="text-[13px] font-medium">{d.name}</div>
                            <div className="text-[11px] text-muted-foreground">#{d.number}</div>
                        </div>
                    </button>
                ),
            },
            {
                key: 'manager_name',
                header: t('col.manager'),
                sortable: true,
                render: (d) => <Badge variant={d.manager_name ? 'secondary' : 'outline'}>{d.manager_name || t('noManager')}</Badge>,
            },
            {
                key: 'parent_name',
                header: t('col.parent'),
                render: (d) =>
                    d.parent_name ? <Badge variant="outline">{d.parent_name}</Badge> : <span className="text-[13px] text-muted-foreground">—</span>,
            },
            {
                key: 'user_count',
                header: t('col.users'),
                width: '72px',
                sortable: true,
                render: (d) => <Badge variant="secondary">{d.user_count || 0}</Badge>,
            },
            {
                key: 'created_on',
                header: t('col.created'),
                width: '100px',
                sortable: true,
                render: (d) => (
                    <span className="text-[12px] text-muted-foreground">{new Date(d.created_on || d.created_at).toLocaleDateString()}</span>
                ),
            },
            {
                key: 'actions',
                header: t('common:table.actions'),
                width: '96px',
                render: (d) => (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditingDepartment(d)}>
                            <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => { setSelectedDepartmentForUsers(d); setShowUserAssignModal(true); }}
                        >
                            <Users className="w-4 h-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            onClick={() => { setDepartmentToDelete(d); setDeleteError(null); setShowDeleteDialog(true); }}
                        >
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                ),
            },
        ],
        [t],
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header & Stats */}
            <div className="shrink-0 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Department Management')}</h1>
                        <p className="text-[13px] text-muted-foreground">{t('description', 'Manage organizational departments and hierarchy')}</p>
                    </div>
                    <Button size="sm" onClick={() => setShowCreateModal(true)}>
                        <Plus size={14} className="mr-1.5" />
                        {t('createDepartment', 'Create Department')}
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
                            <div className="text-2xl font-bold">{departments.filter((d) => d.manager_name).length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.withManager', 'With Manager')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{departments.filter((d) => d.parent_name).length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.sub', 'Sub-Depts')}</div>
                        </Card>
                    </div>
                )}

                {/* Search */}
                <Input
                    placeholder={t('searchPlaceholder', 'Search by name or number...')}
                    value={filters.search}
                    onChange={(e) => updateFilters({ search: e.target.value })}
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
                        columns={deptColumns}
                        data={departments}
                        rowKey={(d) => d.id}
                        sortState={{ col: sortBy, dir: sortDir }}
                        onSortChange={handleSortChange}
                        onRowDoubleClick={(d) => navigate(`/manage/departments/${d.id}`)}
                        emptyMessage={filters.search ? t('table.empty.search') : t('table.empty.default')}
                        emptyIcon={<Building2 size={32} strokeWidth={1.2} />}
                        selection={{
                            selectedIds: selectedDepartments,
                            onSelectedIdsChange: setSelectedDepartments,
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
                        { value: 'name', label: t('sort.name') },
                        { value: 'number', label: t('sort.number') },
                        { value: 'manager_name', label: t('sort.manager') },
                        { value: 'user_count', label: t('sort.users') },
                        { value: 'created_on', label: t('sort.created') },
                    ]}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={handleSortChange}
                />
            </div>

            <DepartmentModal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                onSubmit={handleCreateDepartment}
                title={t('createDepartment', 'Create Department')}
            />

            <DepartmentModal
                isOpen={!!editingDepartment}
                onClose={() => setEditingDepartment(null)}
                onSubmit={handleEditDepartment}
                department={editingDepartment ?? undefined}
                title={t('editDepartment', 'Edit Department')}
            />

            <UserAssignModal isOpen={showUserAssignModal} onClose={() => setShowUserAssignModal(false)} department={selectedDepartmentForUsers} />

            <AppModal
                open={showDeleteDialog}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowDeleteDialog(false);
                        setDepartmentToDelete(null);
                        setDeleteError(null);
                    }
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('delete.title')}
                    </span>
                }
                size="xs"
                style={{ maxWidth: '22rem' }}
                showCancelButton
                cancelLabel={t('delete.cancel')}
                cancelDisabled={deleteLoading}
                errorMessage={deleteError ?? undefined}
                primaryAction={{
                    label: deleteLoading ? t('delete.loading') : t('delete.submit'),
                    variant: 'destructive',
                    onClick: handleDeleteConfirm,
                    loading: deleteLoading,
                    disabled: deleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('delete.confirmPre')} <span className="font-medium text-foreground">"{departmentToDelete?.name}"</span>
                    {t('delete.confirmPost')}
                    {(departmentToDelete?.user_count || 0) > 0 && (
                        <span className="block mt-2 text-destructive">{t('delete.usersWarning', { count: departmentToDelete?.user_count })}</span>
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
                        {t('bulkDelete.title', 'Delete Departments')}
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
                    {t('bulkDelete.confirm', 'Are you sure you want to delete')}{' '}
                    <span className="font-medium text-foreground">{selectedDepartments.length}</span>{' '}
                    {t('bulkDelete.suffix', 'departments? This cannot be undone.')}
                </p>
            </AppModal>
        </div>
    );
}
