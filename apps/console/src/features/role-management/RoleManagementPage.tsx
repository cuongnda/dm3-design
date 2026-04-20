import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit, Trash2, Shield, KeyRound, Lock } from 'lucide-react';
import {
    Button,
    Input,
    Badge,
    AppModal,
    DataTable,
    type Column,
    Card,
} from '@dm3/ui';
import { listRbacRoles, deleteRbacRole, listRbacPermissions } from '@/lib/api';
import { toast } from '@/lib/toast';
import { RoleModal } from './RoleModal';
import type { Role, Permission } from './types';

// Built-in fixed roles are enforced in backend code (not stored as rbac_roles rows).
// We surface them here as read-only entries so the list is never misleadingly empty.
const BUILTIN_ROLE_KEYS = ['system_admin', 'primary_manager', 'member'] as const;

function isBuiltinRole(role: Role): boolean {
    return role.id.startsWith('builtin:');
}

function buildBuiltinRoles(t: (key: string) => string): Role[] {
    return BUILTIN_ROLE_KEYS.map((key): Role => ({
        id: `builtin:${key}`,
        tenant_id: '',
        name: t(`builtin.${key}.name`),
        description: t(`builtin.${key}.description`),
        template_key: key,
        is_system_template_copy: false,
        status: 'active',
        permissions: [],
        assignment_count: 0,
        created_at: '',
        updated_at: '',
    }));
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'active':
            return 'default';
        case 'inactive':
            return 'secondary';
        default:
            return 'outline';
    }
}

export function RoleManagementPage() {
    const { t } = useTranslation('roles');
    const navigate = useNavigate();

    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);
    const [deletingRole, setDeletingRole] = useState<Role | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const fetchRoles = useCallback(async () => {
        setLoading(true);
        try {
            const data = await listRbacRoles();
            setRoles(data || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch roles';
            toast(message, 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchRoles();
        listRbacPermissions()
            .then((p) => setPermissions(p || []))
            .catch(() => setPermissions([]));
    }, [fetchRoles]);

    const handleDeleteConfirm = async () => {
        if (!deletingRole) return;
        setDeleteLoading(true);
        try {
            await deleteRbacRole(deletingRole.id);
            setDeletingRole(null);
            void fetchRoles();
            toast(t('toast.deleted'), 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to delete role';
            toast(message, 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    const builtinRoles = useMemo(() => buildBuiltinRoles(t), [t]);

    const displayRoles = useMemo(() => [...builtinRoles, ...roles], [builtinRoles, roles]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return displayRoles;
        return displayRoles.filter(
            (r) =>
                r.name.toLowerCase().includes(q) ||
                (r.description ?? '').toLowerCase().includes(q) ||
                (r.template_key ?? '').toLowerCase().includes(q),
        );
    }, [displayRoles, search]);

    const roleColumns = useMemo(
        (): Column<Role>[] => [
            {
                key: 'name',
                header: t('col.name'),
                sortable: true,
                render: (r) => {
                    const builtin = isBuiltinRole(r);
                    return (
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border bg-muted flex items-center justify-center">
                                {builtin ? (
                                    <Lock size={14} className="text-muted-foreground" />
                                ) : (
                                    <Shield size={14} className="text-muted-foreground" />
                                )}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-[13px] font-medium truncate">{r.name}</span>
                                {builtin ? (
                                    <Badge variant="outline" className="mt-0.5 w-fit text-[10px] px-1.5 py-0">
                                        {t('builtin.badge')}
                                    </Badge>
                                ) : r.template_key ? (
                                    <span className="font-mono text-[11px] text-muted-foreground truncate">
                                        {r.template_key}
                                    </span>
                                ) : (
                                    <span className="text-[11px] text-muted-foreground">{t('custom')}</span>
                                )}
                            </div>
                        </div>
                    );
                },
            },
            {
                key: 'description',
                header: t('col.description'),
                render: (r) => (
                    <span className="text-[13px] text-muted-foreground truncate">
                        {r.description || '—'}
                    </span>
                ),
            },
            {
                key: 'permissions',
                header: t('col.permissions'),
                width: '120px',
                render: (r) =>
                    isBuiltinRole(r) ? (
                        <span className="text-[13px] text-muted-foreground">—</span>
                    ) : (
                        <span className="text-[13px] tabular-nums">{r.permissions?.length ?? 0}</span>
                    ),
            },
            {
                key: 'assignment_count',
                header: t('col.assignments'),
                width: '120px',
                render: (r) =>
                    isBuiltinRole(r) ? (
                        <span className="text-[13px] text-muted-foreground">—</span>
                    ) : (
                        <span className="text-[13px] tabular-nums">{r.assignment_count}</span>
                    ),
            },
            {
                key: 'status',
                header: t('col.status'),
                width: '96px',
                render: (r) => (
                    <Badge variant={statusVariant(r.status)}>{t(`status.${r.status}`, r.status)}</Badge>
                ),
            },
            {
                key: 'actions',
                header: t('common:table.actions'),
                width: '104px',
                render: (r) => {
                    if (isBuiltinRole(r)) {
                        return <span className="sr-only">—</span>;
                    }
                    return (
                        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingRole(r)}
                                title={t('modal.editTitle')}
                                data-testid={`role-button-edit-${r.id}`}
                            >
                                <Edit size={14} />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeletingRole(r)}
                                title={t('delete.title')}
                                className="text-destructive hover:text-destructive"
                                data-testid={`role-button-delete-${r.id}`}
                                disabled={r.assignment_count > 0}
                            >
                                <Trash2 size={14} />
                            </Button>
                        </div>
                    );
                },
            },
        ],
        [t],
    );

    const totalAssignments = useMemo(
        () => roles.reduce((sum, r) => sum + (r.assignment_count || 0), 0),
        [roles],
    );

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            <div className="shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-[18px] font-semibold text-foreground">{t('title')}</h1>
                        <p className="text-[13px] text-muted-foreground">{t('description')}</p>
                    </div>
                    <Button
                        size="sm"
                        onClick={() => setShowCreateModal(true)}
                        data-testid="role-button-create"
                    >
                        <Plus size={14} className="mr-1.5" />
                        {t('addRole')}
                    </Button>
                </div>

                {!loading && (
                    <div className="grid grid-cols-3 gap-3">
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{roles.length}</div>
                            <div className="text-xs text-muted-foreground">{t('stats.total', 'Total roles')}</div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{permissions.length}</div>
                            <div className="text-xs text-muted-foreground">
                                {t('stats.permissions', 'Permissions available')}
                            </div>
                        </Card>
                        <Card className="p-3">
                            <div className="text-2xl font-bold">{totalAssignments}</div>
                            <div className="text-xs text-muted-foreground">
                                {t('stats.assignments', 'Active assignments')}
                            </div>
                        </Card>
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <Input
                        placeholder={t('searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-8 text-[13px] flex-1"
                        data-testid="role-input-search"
                    />
                    {search && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSearch('')}
                            className="text-muted-foreground"
                        >
                            {t('filter.clear')}
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
                <div className="min-h-0 flex-1 overflow-auto">
                    <DataTable
                        embedded
                        stickyHeader
                        paginate={false}
                        loading={loading}
                        columns={roleColumns}
                        data={filtered}
                        rowKey={(r) => r.id}
                        onRowDoubleClick={(r) => {
                            if (isBuiltinRole(r)) return;
                            navigate(`/settings/roles/${r.id}`);
                        }}
                        emptyIcon={<KeyRound size={32} strokeWidth={1.2} />}
                        emptyTitle={
                            search
                                ? t('table.empty.searchTitle', 'No roles match this search')
                                : t('table.empty.defaultTitle', 'No custom roles yet')
                        }
                        emptyDescription={
                            search
                                ? t('table.empty.searchHint', 'Try a different keyword or clear the filters above.')
                                : t(
                                      'table.empty.defaultHint',
                                      'Create roles to give groups of users scoped access to permissions.',
                                  )
                        }
                        emptyAction={
                            search
                                ? {
                                      label: t('filter.clear', 'Clear filters'),
                                      variant: 'outline',
                                      onClick: () => setSearch(''),
                                      'data-testid': 'role-button-clear-filters-empty',
                                  }
                                : {
                                      label: t('addRole'),
                                      icon: <Plus size={14} />,
                                      onClick: () => setShowCreateModal(true),
                                      'data-testid': 'role-button-create-empty',
                                  }
                        }
                    />
                </div>
            </div>

            <AppModal
                open={!!deletingRole}
                onOpenChange={(open) => {
                    if (!open) setDeletingRole(null);
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
                    className:
                        'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
                    onClick: handleDeleteConfirm,
                    loading: deleteLoading,
                    disabled: deleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('delete.confirmPre')}{' '}
                    <span className="font-medium text-foreground">{deletingRole?.name}</span>
                    {t('delete.confirmPost')}
                </p>
            </AppModal>

            <RoleModal
                open={showCreateModal || !!editingRole}
                role={editingRole}
                permissions={permissions}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowCreateModal(false);
                        setEditingRole(null);
                    }
                }}
                onSaved={() => {
                    setShowCreateModal(false);
                    setEditingRole(null);
                    void fetchRoles();
                }}
            />
        </div>
    );
}
