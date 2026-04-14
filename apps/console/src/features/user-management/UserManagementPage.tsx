import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Trash, Users } from 'lucide-react';
import { Button, Input, Multiselect, Badge, AppModal, DataTable, type Column, Card, TablePaginationFooter } from '@dm3/ui';
import { apiFetch, assetUrl } from '@/lib/api';
import { toast } from '@/lib/toast';
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
    const navigate = useNavigate();

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
    const [deletingUser, setDeletingUser] = useState<User | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
    const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

    useEffect(() => {
        apiFetch<{ departments: Department[] }>('/api/v1/identity/departments?limit=200')
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
            }>(`/api/v1/identity/users?${params}`);
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


    const handleDeleteConfirm = async () => {
        if (!deletingUser) return;
        setDeleteLoading(true);
        try {
            await apiFetch(`/api/v1/identity/users/${deletingUser.id}`, { method: 'DELETE' });
            setDeletingUser(null);
            fetchUsers();
            toast(t('toast.deleted'), 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete user';
            toast(message, 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    const handleBulkDeleteConfirm = async () => {
        setBulkDeleteLoading(true);
        try {
            await apiFetch('/api/v1/identity/users/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: Array.from(selected) }),
            });
            setSelected(new Set());
            setShowBulkDeleteDialog(false);
            fetchUsers();
            toast(t('toast.bulkDeleted', { count: selected.size }), 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk delete failed';
            toast(message, 'error');
        } finally {
            setBulkDeleteLoading(false);
        }
    };

    const handleSortChange = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
        setSortBy(col);
        setSortDir(dir);
    }, []);

    const userColumns = useMemo(
        (): Column<User>[] => [
            {
                key: 'full_name',
                header: t('col.name'),
                sortable: true,
                render: (u) => {
                    const initials = `${u.first_name?.[0] ?? ''}${u.last_name?.[0] ?? ''}`.toUpperCase() || '?';
                    const name = u.full_name || `${u.first_name} ${u.last_name}`;
                    return (
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted flex items-center justify-center">
                                {u.avatar ? (
                                    <img
                                        src={assetUrl(u.avatar)}
                                        alt={name}
                                        className="h-full w-full object-cover"
                                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                    />
                                ) : (
                                    <span className="text-[11px] font-semibold text-muted-foreground">{initials}</span>
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-medium truncate">{name}</span>
                                <span className="font-mono text-[11px] text-muted-foreground truncate">{u.user_code}</span>
                            </div>
                        </div>
                    );
                },
            },
            {
                key: 'email',
                header: t('col.email'),
                sortable: true,
                render: (u) => <span className="text-[13px] text-muted-foreground">{u.email}</span>,
            },
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
                header: t('common:table.actions'),
                width: '88px',
                render: (u) => (
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/manage/users/${u.id}`)} title={t('modal.editTitle')}>
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
            {/* Header & Stats */}
            <div className="shrink-0 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[18px] font-semibold text-foreground">{t('title')}</h1>
                        <p className="text-[13px] text-muted-foreground">{t('description')}</p>
                    </div>
                    <Button size="sm" onClick={() => navigate('/manage/users/new')}>
                        <Plus size={14} className="mr-1.5" />
                        {t('addUser')}
                    </Button>
                </div>

                {/* Stats */}
                {!loading && (
                    <div className="grid grid-cols-3 gap-3">
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{total}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.total', 'Total')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{users.filter((u) => u.status === 'active').length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.active', 'Active')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{users.filter((u) => u.status !== 'active').length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.inactive', 'Inactive')}</div>
                        </Card>
                    </div>
                )}

                {/* Search + filters */}
                <div className="flex items-center gap-2">
                <Input placeholder={t('searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-[13px] flex-1" />

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
            </div>

            {/* Table */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
                <div className="min-h-0 flex-1 overflow-auto">
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        loading={loading}
                        columns={userColumns}
                        data={users}
                        rowKey={(u) => u.id}
                        sortState={{ col: sortBy, dir: sortDir }}
                        onSortChange={handleSortChange}
                        onRowDoubleClick={(u) => navigate(`/manage/users/${u.id}`)}
                        emptyMessage={search ? t('table.empty.search') : t('table.empty.default')}
                        emptyIcon={<Users size={32} strokeWidth={1.2} />}
                        selection={{
                            selectedIds: Array.from(selected),
                            onSelectedIdsChange: (ids) => setSelected(new Set(ids)),
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
                    page={page}
                    pageSize={pageSize}
                    total={total}
                    totalPages={totalPages}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                    loading={loading}
                    sortColumns={[
                        { value: 'user_code', label: t('col.code') },
                        { value: 'full_name', label: t('col.name') },
                        { value: 'email', label: t('col.email') },
                        { value: 'position', label: t('col.position') },
                        { value: 'department_name', label: t('col.department') },
                        { value: 'status', label: t('col.status') },
                    ]}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={handleSortChange}
                />
            </div>

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

            {/* Bulk delete confirmation */}
            <AppModal
                open={showBulkDeleteDialog}
                onOpenChange={(open) => { if (!open) setShowBulkDeleteDialog(false); }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('delete.bulkTitle', 'Delete Users')}
                    </span>
                }
                size="xs"
                showCancelButton
                cancelLabel={t('delete.cancel')}
                cancelDisabled={bulkDeleteLoading}
                primaryAction={{
                    label: bulkDeleteLoading ? t('delete.loading') : t('delete.submit'),
                    variant: 'outline',
                    className: 'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
                    onClick: handleBulkDeleteConfirm,
                    loading: bulkDeleteLoading,
                    disabled: bulkDeleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('delete.bulkConfirm', 'Are you sure you want to delete')}{' '}
                    <span className="font-medium text-foreground">{selected.size}</span>{' '}
                    {t('delete.bulkSuffix', 'users? This cannot be undone.')}
                </p>
            </AppModal>
        </div>
    );
}
