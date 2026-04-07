import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Edit, Trash2 } from 'lucide-react';
import { Button, Input, Multiselect, Badge, AppModal, DataTableCard, DataTable, type Column } from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { UserModal } from './UserModal';
import type { User } from './types';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface Department {
    id: string;
    name: string;
}

function statusVariantForUser(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'active':
            return 'default';
        case 'inactive':
            return 'secondary';
        case 'suspended':
            return 'destructive';
        default:
            return 'outline';
    }
}

export function UserManagementPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string[]>([]);
    const [departmentFilter, setDepartmentFilter] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState<string | null>('user_code');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
    const [departments, setDepartments] = useState<Department[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        apiFetch<{ departments: Department[] }>('/api/v1/departments?limit=200')
            .then((d) => setDepartments(d.departments || []))
            .catch(() => {});
    }, []);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
            if (search) params.append('search', search);
            statusFilter.forEach((s) => params.append('status', s));
            departmentFilter.forEach((d) => params.append('department_id', d));
            const sortByApiMap: Record<string, string> = { status: 'user_status' };
            if (sortBy) params.append('sort_by', sortByApiMap[sortBy] ?? sortBy);
            if (sortDir) params.append('sort_order', sortDir.toUpperCase());
            const data = await apiFetch<{
                users: User[];
                pagination: { total: number; total_pages: number };
            }>(`/api/v1/users?${params}`);
            setUsers(data.users || []);
            setTotal(data.pagination?.total || 0);
            setTotalPages(data.pagination?.total_pages || 1);
        } catch (err) {
            console.error('Failed to fetch users:', err);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, search, statusFilter.join(','), departmentFilter.join(','), sortBy, sortDir]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        setPage(1);
    }, [search, pageSize, statusFilter.join(','), departmentFilter.join(','), sortBy, sortDir]);

    // Clear selection when page changes
    useEffect(() => {
        setSelected(new Set());
    }, [page, search]);

    const handleCreate = async (data: Partial<User>) => {
        const result = await apiFetch<{ id: string }>('/api/v1/users', { method: 'POST', body: JSON.stringify(data) });
        setShowCreateModal(false);
        fetchUsers();
        return result;
    };

    const handleEdit = async (data: Partial<User>) => {
        if (!editingUser) return;
        await apiFetch(`/api/v1/users/${editingUser.id}`, { method: 'PUT', body: JSON.stringify(data) });
        setEditingUser(null);
        fetchUsers();
        return editingUser;
    };

    const handleDeleteConfirm = async () => {
        if (!deletingUser) return;
        setDeleteLoading(true);
        try {
            await apiFetch(`/api/v1/users/${deletingUser.id}`, { method: 'DELETE' });
            setDeletingUser(null);
            fetchUsers();
        } catch (err) {
            console.error('Failed to delete user:', err);
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        await apiFetch('/api/v1/users/bulk-delete', {
            method: 'POST',
            body: JSON.stringify({ ids: Array.from(selected) }),
        });
        setSelected(new Set());
        fetchUsers();
    };

    const handleSortChange = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
        setSortBy(col);
        setSortDir(dir);
    }, []);

    const userColumns = useMemo(
        (): Column<User>[] => [
            {
                key: 'user_code',
                header: 'Code',
                width: '96px',
                sortable: true,
                render: (u) => <span className="font-mono text-[12px] text-muted-foreground">{u.user_code}</span>,
            },
            {
                key: 'full_name',
                header: 'Name',
                sortable: true,
                render: (u) => <span className="text-[13px] font-medium">{u.full_name || `${u.first_name} ${u.last_name}`}</span>,
            },
            { key: 'email', header: 'Email', sortable: true, render: (u) => <span className="text-[13px] text-muted-foreground">{u.email}</span> },
            { key: 'position', header: 'Position', sortable: true, render: (u) => <span className="text-[13px]">{u.position || '—'}</span> },
            {
                key: 'department_name',
                header: 'Department',
                sortable: true,
                render: (u) => <span className="text-[13px]">{u.department_name || '—'}</span>,
            },
            {
                key: 'status',
                header: 'Status',
                width: '96px',
                sortable: true,
                render: (u) => <Badge variant={statusVariantForUser(u.status)}>{u.status}</Badge>,
            },
            {
                key: 'actions',
                header: '',
                width: '88px',
                render: (u) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(u)} title="Edit">
                            <Edit size={14} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingUser(u)}
                            title="Delete"
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2 size={14} />
                        </Button>
                    </div>
                ),
            },
        ],
        [],
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">User Management</h1>
                    <p className="text-[13px] text-muted-foreground">Manage company users and access</p>
                </div>
                <Button size="sm" onClick={() => setShowCreateModal(true)}>
                    <Plus size={14} className="mr-1.5" />
                    Add User
                </Button>
            </div>

            {/* Search + filters */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input placeholder="Search by name, email, code..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>

                <Multiselect
                    options={[
                        { value: 'active', label: 'Active' },
                        { value: 'inactive', label: 'Inactive' },
                        { value: 'suspended', label: 'Suspended' },
                    ]}
                    values={statusFilter}
                    onValuesChange={setStatusFilter}
                    placeholder="All statuses"
                    className="w-36"
                />

                <Multiselect
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    values={departmentFilter}
                    onValuesChange={setDepartmentFilter}
                    placeholder="All departments"
                    className="w-44"
                />

                {(statusFilter.length > 0 || departmentFilter.length > 0 || search) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            setSearch('');
                            setStatusFilter([]);
                            setDepartmentFilter([]);
                        }}
                        className="text-muted-foreground"
                    >
                        Clear
                    </Button>
                )}

            </div>

            <DataTableCard
                title={<span className="text-[14px] font-semibold">Users ({total})</span>}
                selectedCount={selected.size}
                onClearSelection={() => setSelected(new Set())}
                onBulkDelete={handleBulkDelete}
                bulkDeleteLabel={`${selected.size} users`}
                pagination={{
                    page,
                    pageSize,
                    total,
                    totalPages,
                    pageSizeOptions: PAGE_SIZE_OPTIONS,
                    onPageChange: setPage,
                    onPageSizeChange: setPageSize,
                    loading,
                    sortColumns: [
                        { value: 'user_code', label: 'Code' },
                        { value: 'full_name', label: 'Name' },
                        { value: 'email', label: 'Email' },
                        { value: 'position', label: 'Position' },
                        { value: 'department_name', label: 'Department' },
                        { value: 'status', label: 'Status' },
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
                ) : users.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-muted-foreground">
                        {search ? 'No users match your search' : 'No users yet. Add the first one.'}
                    </div>
                ) : (
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        columns={userColumns}
                        data={users}
                        rowKey={(u) => u.id}
                        sortState={{ col: sortBy, dir: sortDir }}
                        onSortChange={handleSortChange}
                        onRowDoubleClick={(u) => setEditingUser(u)}
                        selection={{
                            selectedIds: Array.from(selected),
                            onSelectedIdsChange: (ids) => setSelected(new Set(ids)),
                            selectAllScope: 'page',
                            selectOnRowClick: true,
                        }}
                    />
                )}
            </DataTableCard>

            {/* Create Modal */}
            <UserModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSave={handleCreate} />

            {/* Edit Modal */}
            <UserModal isOpen={!!editingUser} onClose={() => setEditingUser(null)} onSave={handleEdit} user={editingUser} />

            {/* Single Delete Dialog */}
            <AppModal
                open={!!deletingUser}
                onOpenChange={(open) => {
                    if (!open) setDeletingUser(null);
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        Delete User
                    </span>
                }
                size="xs"
                style={{ maxWidth: '22rem' }}
                showCancelButton
                cancelLabel="Cancel"
                cancelDisabled={deleteLoading}
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
                    <span className="font-medium text-foreground">
                        {deletingUser?.full_name || `${deletingUser?.first_name} ${deletingUser?.last_name}`}
                    </span>
                    ? This action cannot be undone.
                </p>
            </AppModal>
        </div>
    );
}
