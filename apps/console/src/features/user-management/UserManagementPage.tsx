import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('users');

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
                header: t('col.code'),
                width: '96px',
                sortable: true,
                render: (u) => <span className="font-mono text-[12px] text-muted-foreground">{u.user_code}</span>,
            },
            {
                key: 'full_name',
                header: t('col.name'),
                sortable: true,
                render: (u) => <span className="text-[13px] font-medium">{u.full_name || `${u.first_name} ${u.last_name}`}</span>,
            },
            { key: 'email', header: t('col.email'), sortable: true, render: (u) => <span className="text-[13px] text-muted-foreground">{u.email}</span> },
            { key: 'position', header: t('col.position'), sortable: true, render: (u) => <span className="text-[13px]">{u.position || '—'}</span> },
            {
                key: 'department_name',
                header: t('col.department'),
                sortable: true,
                render: (u) => <span className="text-[13px]">{u.department_name || '—'}</span>,
            },
            {
                key: 'status',
                header: t('col.status'),
                width: '96px',
                sortable: true,
                render: (u) => <Badge variant={statusVariantForUser(u.status)}>{t(`status.${u.status}`, u.status)}</Badge>,
            },
            {
                key: 'actions',
                header: '',
                width: '88px',
                render: (u) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => setEditingUser(u)} title={t('modal.editTitle')}>
                            <Edit size={14} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeletingUser(u)}
                            title={t('delete.title')}
                            className="text-destructive hover:text-destructive"
                        >
                            <Trash2 size={14} />
                        </Button>
                    </div>
                ),
            },
        ],
        [t],
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">{t('title')}</h1>
                    <p className="text-[13px] text-muted-foreground">{t('description')}</p>
                </div>
                <Button size="sm" onClick={() => setShowCreateModal(true)}>
                    <Plus size={14} className="mr-1.5" />
                    {t('addUser')}
                </Button>
            </div>

            {/* Search + filters */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>

                <Multiselect
                    options={[
                        { value: 'active', label: t('status.active') },
                        { value: 'inactive', label: t('status.inactive') },
                        { value: 'suspended', label: t('status.suspended') },
                    ]}
                    values={statusFilter}
                    onValuesChange={setStatusFilter}
                    placeholder={t('filter.allStatuses')}
                    className="w-36"
                />

                <Multiselect
                    options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    values={departmentFilter}
                    onValuesChange={setDepartmentFilter}
                    placeholder={t('filter.allDepartments')}
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
                        {t('filter.clear')}
                    </Button>
                )}
            </div>

            <DataTableCard
                title={<span className="text-[14px] font-semibold">{t('table.title', { count: total })}</span>}
                selectedCount={selected.size}
                onClearSelection={() => setSelected(new Set())}
                onBulkDelete={handleBulkDelete}
                bulkDeleteLabel={t('bulkDelete.label', { count: selected.size })}
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
                        { value: 'user_code', label: t('col.code') },
                        { value: 'full_name', label: t('col.name') },
                        { value: 'email', label: t('col.email') },
                        { value: 'position', label: t('col.position') },
                        { value: 'department_name', label: t('col.department') },
                        { value: 'status', label: t('col.status') },
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
                        {search ? t('table.empty.search') : t('table.empty.default')}
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
                        {t('delete.title')}
                    </span>
                }
                size="xs"
                style={{ maxWidth: '22rem' }}
                showCancelButton
                cancelLabel={t('delete.cancel')}
                cancelDisabled={deleteLoading}
                primaryAction={{
                    label: deleteLoading ? t('delete.loading') : t('delete.submit'),
                    variant: 'outline',
                    className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
                    onClick: handleDeleteConfirm,
                    loading: deleteLoading,
                    disabled: deleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('delete.confirmPre')}{' '}
                    <span className="font-medium text-foreground">
                        {deletingUser?.full_name || `${deletingUser?.first_name} ${deletingUser?.last_name}`}
                    </span>
                    {t('delete.confirmPost')}
                </p>
            </AppModal>
        </div>
    );
}
