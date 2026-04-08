import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Building2, Plus, Search, MoreHorizontal,
  Edit, Trash2, Users,
} from 'lucide-react';
import {
  Button, Input,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  Badge, AppModal,
  DataTableCard, DataTable, type Column,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useDepartmentManagement } from './hooks/useDepartmentManagement';
import { DepartmentModal } from './components/DepartmentModal';
import { UserAssignModal } from './components/UserAssignModal';
import type { Department, DepartmentFormData } from './types';

export function DepartmentManagementPage() {
  const { t } = useTranslation('departments');

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
      await apiFetch(`/api/v1/departments/${departmentToDelete.id}`, { method: 'DELETE' });
      setShowDeleteDialog(false);
      setDepartmentToDelete(null);
      fetchDepartments();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete department';
      try { const j = JSON.parse(msg.replace(/^API \d+: /, '')); setDeleteError(j.message || j.error || msg); }
      catch { setDeleteError(msg.replace(/^API \d+: /, '')); }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDepartments.length === 0) return;
    await apiFetch('/api/v1/departments/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: selectedDepartments }),
    });
    setSelectedDepartments([]);
    fetchDepartments();
  };

  const deptColumns = useMemo((): Column<Department>[] => [
    {
      key: 'name',
      header: 'Department',
      sortable: true,
      render: (d) => (
        <div className="flex items-center gap-2">
          <Building2 size={14} className="text-primary shrink-0" />
          <div>
            <div className="text-[13px] font-medium">{d.name}</div>
            <div className="text-[11px] text-muted-foreground">#{d.number}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'manager_name',
      header: 'Manager',
      sortable: true,
      render: (d) => (
        <Badge variant={d.manager_name ? 'secondary' : 'outline'}>
          {d.manager_name || 'No Manager'}
        </Badge>
      ),
    },
    {
      key: 'parent_name',
      header: 'Parent',
      render: (d) => d.parent_name
        ? <Badge variant="outline">{d.parent_name}</Badge>
        : <span className="text-[13px] text-muted-foreground">—</span>,
    },
    {
      key: 'user_count',
      header: 'Users',
      width: '72px',
      sortable: true,
      render: (d) => <Badge variant="secondary">{d.user_count || 0}</Badge>,
    },
    {
      key: 'created_on',
      header: 'Created',
      width: '100px',
      sortable: true,
      render: (d) => (
        <span className="text-[12px] text-muted-foreground">
          {new Date(d.created_on || d.created_at).toLocaleDateString()}
        </span>
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
              <Button variant="ghost" size="sm"><MoreHorizontal size={14} /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingDepartment(d)}>
                <Edit size={14} className="mr-2" />Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSelectedDepartmentForUsers(d); setShowUserAssignModal(true); }}>
                <Users size={14} className="mr-2" />Manage Users
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setDepartmentToDelete(d); setDeleteError(null); setShowDeleteDialog(true); }} className="text-destructive">
                <Trash2 size={14} className="mr-2" />Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ], []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Department Management')}</h1>
          <p className="text-[13px] text-muted-foreground">{t('description', 'Manage organizational departments and hierarchy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus size={14} className="mr-1.5" />
            {t('createDepartment', 'Create Department')}
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t('searchPlaceholder', 'Search by name or number...')}
            value={filters.search}
            onChange={(e) => updateFilters({ search: e.target.value })}
            className="pl-9"
          />
        </div>
      </div>

      <DataTableCard
        title={<span className="text-[14px] font-semibold">Departments ({pagination.total})</span>}
        selectedCount={selectedDepartments.length}
        onClearSelection={() => setSelectedDepartments([])}
        onBulkDelete={handleBulkDelete}
        bulkDeleteLabel={`${selectedDepartments.length} departments`}
        pagination={{
          page: pagination.page,
          pageSize: pagination.limit,
          total: pagination.total,
          totalPages: pagination.total_pages,
          pageSizeOptions: [10, 20, 50, 100],
          onPageChange: changePage,
          onPageSizeChange: changePageSize,
          loading,
          sortColumns: [
            { value: 'name', label: 'Name' },
            { value: 'number', label: 'Number' },
            { value: 'manager_name', label: 'Manager' },
            { value: 'user_count', label: 'Users' },
            { value: 'created_on', label: 'Created' },
          ],
          sortBy,
          sortDir,
          onSortChange: handleSortChange,
        }}
      >
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : departments.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">
            {filters.search ? 'No departments match your search' : 'No departments yet. Add the first one.'}
          </div>
        ) : (
          <DataTable
            embedded
            stickyHeader
            paginate={false}
            columns={deptColumns}
            data={departments}
            rowKey={(d) => d.id}
            sortState={{ col: sortBy, dir: sortDir }}
            onSortChange={handleSortChange}
            onRowDoubleClick={(d) => setEditingDepartment(d)}
            selection={{
              selectedIds: selectedDepartments,
              onSelectedIdsChange: setSelectedDepartments,
              selectAllScope: 'page',
              selectOnRowClick: true,
            }}
          />
        )}
      </DataTableCard>

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

      <UserAssignModal
        isOpen={showUserAssignModal}
        onClose={() => setShowUserAssignModal(false)}
        department={selectedDepartmentForUsers}
      />

      <AppModal
        open={showDeleteDialog}
        onOpenChange={(open) => {
          if (!open) { setShowDeleteDialog(false); setDepartmentToDelete(null); setDeleteError(null); }
        }}
        title={
          <span className="flex items-center gap-2 text-destructive">
            <Trash2 size={16} />Delete Department
          </span>
        }
        size="xs"
        style={{ maxWidth: '22rem' }}
        showCancelButton
        cancelLabel="Cancel"
        cancelDisabled={deleteLoading}
        errorMessage={deleteError ?? undefined}
        primaryAction={{
          label: deleteLoading ? 'Deleting...' : 'Delete',
          variant: 'destructive',
          onClick: handleDeleteConfirm,
          loading: deleteLoading,
          disabled: deleteLoading,
        }}
      >
        <p className="text-[13px] text-muted-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium text-foreground">"{departmentToDelete?.name}"</span>?
          {(departmentToDelete?.user_count || 0) > 0 && (
            <span className="block mt-2 text-destructive">
              ⚠ This department has {departmentToDelete?.user_count} users assigned.
            </span>
          )}
        </p>
      </AppModal>
    </div>
  );
}
