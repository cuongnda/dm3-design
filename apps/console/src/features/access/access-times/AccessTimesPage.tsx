import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Plus, Edit, Settings, Trash2 } from 'lucide-react';
import {
    Button,
    Input,
    Badge,
    AppModal,
    DataTable,
    type Column,
    Card,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { useAccessTimes } from './hooks/useAccessTimes';
import type { AccessTime } from './types';

export function AccessTimesPage() {
    const { t } = useTranslation('accessTimes');
    const navigate = useNavigate();

    const { accessTimes, loading, pagination, fetchAccessTimes } = useAccessTimes();

    const [search, setSearch] = useState('');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [timeToDelete, setTimeToDelete] = useState<AccessTime | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const filteredTimes = accessTimes.filter((at) =>
        at.name.toLowerCase().includes(search.toLowerCase()) ||
        (at.description ?? '').toLowerCase().includes(search.toLowerCase())
    );

    const handleDelete = (at: AccessTime) => {
        setTimeToDelete(at);
        setShowDeleteDialog(true);
    };

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
            setDeleteError(msg.replace(/^API \d+: /, ''));
        } finally {
            setDeleteLoading(false);
        }
    };

    const columns: Column<AccessTime>[] = [
        {
            key: 'name',
            header: t('columns.name', 'Name'),
            render: (at) => (
                <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${at.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <div>
                        <p className="text-[13px] font-medium">{at.name}</p>
                        {at.description && <p className="text-[11px] text-muted-foreground">{at.description}</p>}
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
            header: t('columns.active', 'Status'),
            width: '80px',
            render: (at) => (
                <Badge variant={at.is_active ? 'default' : 'secondary'}>
                    {at.is_active ? t('badge.active', 'Active') : t('badge.inactive', 'Inactive')}
                </Badge>
            ),
        },
        {
            key: 'slots',
            header: t('columns.slots', 'Slots'),
            width: '72px',
            render: (at) => <Badge variant="secondary">{at.slot_count ?? at.slots?.length ?? 0}</Badge>,
        },
        {
            key: 'actions',
            header: '',
            width: '100px',
            render: (at) => (
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/access/access-times/${at.id}`);
                        }}
                    >
                        <Settings className="w-4 h-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(at);
                        }}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-[18px] font-semibold text-foreground">{t('title', 'Access Times')}</h1>
                    <p className="text-[13px] text-muted-foreground">{t('description', 'Manage access time schedules')}</p>
                </div>
                <Button size="sm" onClick={() => navigate('/access/access-times/new')}>
                    <Plus size={14} className="mr-1.5" />
                    {t('newAccessTime', 'New Access Time')}
                </Button>
            </div>

            {/* Stats */}
            {!loading && (
                <div className="grid grid-cols-3 gap-3">
                    <Card className="p-3">
                        <div className="text-2xl font-bold">{accessTimes.filter(a => a.is_active).length}</div>
                        <div className="text-xs text-muted-foreground">{t('stats.active', 'Active')}</div>
                    </Card>
                    <Card className="p-3">
                        <div className="text-2xl font-bold">{accessTimes.length}</div>
                        <div className="text-xs text-muted-foreground">{t('stats.total', 'Total')}</div>
                    </Card>
                    <Card className="p-3">
                        <div className="text-2xl font-bold">{accessTimes.filter(a => !a.is_active).length}</div>
                        <div className="text-xs text-muted-foreground">{t('stats.inactive', 'Inactive')}</div>
                    </Card>
                </div>
            )}

            {/* Search */}
            <Input
                placeholder={t('searchPlaceholder', 'Search access times...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-[13px]"
            />

            {/* Table */}
            {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
                <DataTable
                    columns={columns}
                    data={filteredTimes}
                    rowKey={(at) => at.id}
                    onRowClick={(at) => navigate(`/access/access-times/${at.id}`)}
                />
            )}

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
                showCancelButton
                cancelLabel={t('cancel', 'Cancel')}
                errorMessage={deleteError ?? undefined}
                primaryAction={{
                    label: deleteLoading ? t('deleting', 'Deleting...') : t('delete', 'Delete'),
                    variant: 'destructive',
                    onClick: handleDeleteConfirm,
                    loading: deleteLoading,
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
