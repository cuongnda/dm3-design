import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Plus, Search, MoreHorizontal, Edit, Trash2, Eye } from 'lucide-react';
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
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessTimes } from './hooks/useAccessTimes';
import type { AccessTime } from './types';

export function AccessTimesPage() {
    const { t } = useTranslation('accessTimes');
    const navigate = useNavigate();

    const { accessTimes, loading, pagination, fetchAccessTimes, changePage, changePageSize } = useAccessTimes();

    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [timeToDelete, setTimeToDelete] = useState<AccessTime | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const filteredTimes = useMemo(() => {
        if (!search.trim()) return accessTimes;
        const q = search.toLowerCase();
        return accessTimes.filter((at) => at.name.toLowerCase().includes(q) || (at.description ?? '').toLowerCase().includes(q));
    }, [accessTimes, search]);

    const handleDeleteConfirm = async () => {
        if (!timeToDelete) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await apiFetch(`/api/v1/access/access-times/${timeToDelete.id}`, { method: 'DELETE' });
            setShowDeleteDialog(false);
            setTimeToDelete(null);
            fetchAccessTimes();
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete access time';
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
            await apiFetch('/api/v1/access/access-times/bulk-delete', { method: 'POST', body: JSON.stringify({ ids: selected }) });
            setSelected([]);
            fetchAccessTimes();
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Bulk delete failed');
        }
    };

    const columns = useMemo(
        (): Column<AccessTime>[] => [
            {
                key: 'name',
                header: t('columns.name', 'Name'),
                sortable: true,
                render: (at) => (
                    <div className="flex items-center gap-2">
                        <Clock size={14} className="text-primary shrink-0" />
                        <div>
                            <div className="text-[13px] font-medium">{at.name}</div>
                            {at.description && <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">{at.description}</div>}
                        </div>
                    </div>
                ),
            },
            {
                key: 'timezone',
                header: t('columns.timezone', 'Timezone'),
                render: (at) => <span className="text-[13px] text-muted-foreground">{at.timezone}</span>,
            },
            {
                key: 'is_active',
                header: t('columns.active', 'Active'),
                width: '80px',
                render: (at) =>
                    at.is_active ? (
                        <Badge variant="default">{t('badge.active', 'Active')}</Badge>
                    ) : (
                        <Badge variant="outline">{t('badge.inactive', 'Inactive')}</Badge>
                    ),
            },
            {
                key: 'slots',
                header: t('columns.slots', 'Slots'),
                width: '72px',
                render: (at) => <Badge variant="secondary">{at.slot_count ?? at.slots?.length ?? 0}</Badge>,
            },
            {
                key: 'created_at',
                header: t('columns.createdAt', 'Created'),
                width: '100px',
                sortable: true,
                render: (at) => <span className="text-[12px] text-muted-foreground">{new Date(at.created_at).toLocaleDateString()}</span>,
            },
            {
                key: 'actions',
                header: '',
                width: '48px',
                render: (at) => (
                    <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                    <MoreHorizontal size={14} />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => navigate(`/access/access-times/${at.id}`)}>
                                    <Eye size={14} className="mr-2" />
                                    {t('view', 'View / Edit')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => {
                                        setTimeToDelete(at);
                                        setShowDeleteDialog(true);
                                    }}
                                    className="text-destructive"
                                >
                                    <Trash2 size={14} className="mr-2" />
                                    {t('delete', 'Delete')}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ),
            },
        ],
        [navigate, t],
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Access Times')}</h1>
                    <p className="text-[13px] text-muted-foreground">{t('description', 'Manage access time schedules and time slot templates')}</p>
                </div>
                <Button size="sm" onClick={() => navigate('/access/access-times/new')}>
                    <Plus size={14} className="mr-1.5" />
                    {t('newAccessTime', 'New Access Time')}
                </Button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2 shrink-0">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder={t('searchPlaceholder', 'Search access times...')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            <DataTableCard
                title={
                    <span className="text-[14px] font-semibold">
                        {t('tableTitle', 'Access Times')} ({pagination.total})
                    </span>
                }
                selectedCount={selected.length}
                onClearSelection={() => setSelected([])}
                onBulkDelete={handleBulkDelete}
                bulkDeleteLabel={`${selected.length} access times`}
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
                ) : filteredTimes.length === 0 ? (
                    <div className="py-12 text-center text-[13px] text-muted-foreground">
                        {search ? t('noResults', 'No access times match your search') : t('empty', 'No access times yet. Create the first one.')}
                    </div>
                ) : (
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        columns={columns}
                        data={filteredTimes}
                        rowKey={(at) => at.id}
                        onRowDoubleClick={(at) => navigate(`/access/access-times/${at.id}`)}
                        selection={{
                            selectedIds: selected,
                            onSelectedIdsChange: setSelected,
                            selectAllScope: 'page',
                        }}
                    />
                )}
            </DataTableCard>

            {/* Delete Confirmation */}
            <AppModal
                open={showDeleteDialog}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowDeleteDialog(false);
                        setTimeToDelete(null);
                        setDeleteError(null);
                    }
                }}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('deleteTitle', 'Delete Access Time')}
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
                    <span className="font-medium text-foreground">"{timeToDelete?.name}"</span>?{' '}
                    {t('deleteWarning', 'This will remove all associated time slots.')}
                </p>
            </AppModal>
        </div>
    );
}
