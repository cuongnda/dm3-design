import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Edit, Trash2, UserPlus, Shield, KeyRound } from 'lucide-react';
import { Button, Badge, AppModal, DataTable, type Column, Card } from '@dm3/ui';
import {
    getRbacRole,
    listRbacPermissions,
    listRbacAssignments,
    deleteRbacAssignment,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import { RoleModal } from './RoleModal';
import { AssignmentModal } from './AssignmentModal';
import type { Role, Permission, Assignment } from './types';

function formatScope(a: Assignment): string {
    if (a.scope_type === 'company' || a.scope_type === 'self') return a.scope_type;
    return a.scope_id ? `${a.scope_type}:${a.scope_id.slice(0, 8)}…` : a.scope_type;
}

export function RoleDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { t } = useTranslation('roles');
    const navigate = useNavigate();

    const [role, setRole] = useState<Role | null>(null);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(false);
    const [assignmentsLoading, setAssignmentsLoading] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showAssignmentModal, setShowAssignmentModal] = useState(false);
    const [deletingAssignment, setDeletingAssignment] = useState<Assignment | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const r = await getRbacRole(id);
            setRole(r);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load role';
            toast(message, 'error');
        } finally {
            setLoading(false);
        }
    }, [id]);

    const loadAssignments = useCallback(async () => {
        if (!id) return;
        setAssignmentsLoading(true);
        try {
            const a = await listRbacAssignments({ roleId: id });
            setAssignments(a);
        } catch {
            setAssignments([]);
        } finally {
            setAssignmentsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
        void loadAssignments();
        listRbacPermissions()
            .then((p) => setPermissions(p))
            .catch(() => setPermissions([]));
    }, [load, loadAssignments]);

    const handleDeleteAssignment = async () => {
        if (!deletingAssignment) return;
        setDeleteLoading(true);
        try {
            await deleteRbacAssignment(deletingAssignment.id);
            setDeletingAssignment(null);
            void loadAssignments();
            void load();
            toast(t('assignment.toast.deleted', 'Assignment removed'), 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to remove assignment';
            toast(message, 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    const assignmentColumns: Column<Assignment>[] = [
        {
            key: 'account',
            header: t('assignment.col.account', 'Account'),
            render: (a) => (
                <div className="flex flex-col">
                    <span className="text-[13px] font-medium">{a.account_email || a.account_id}</span>
                    <span className="font-mono text-[11px] text-muted-foreground truncate">{a.account_id}</span>
                </div>
            ),
        },
        {
            key: 'scope',
            header: t('assignment.col.scope', 'Scope'),
            width: '180px',
            render: (a) => (
                <Badge variant="outline" className="font-mono text-[11px]">
                    {formatScope(a)}
                </Badge>
            ),
        },
        {
            key: 'effective_from',
            header: t('assignment.col.from', 'From'),
            width: '130px',
            render: (a) => (
                <span className="text-[12px] text-muted-foreground">
                    {a.effective_from ? new Date(a.effective_from).toLocaleDateString() : '—'}
                </span>
            ),
        },
        {
            key: 'effective_to',
            header: t('assignment.col.to', 'To'),
            width: '130px',
            render: (a) => (
                <span className="text-[12px] text-muted-foreground">
                    {a.effective_to ? new Date(a.effective_to).toLocaleDateString() : '—'}
                </span>
            ),
        },
        {
            key: 'actions',
            header: t('common:table.actions'),
            width: '72px',
            render: (a) => (
                <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeletingAssignment(a)}
                        title={t('assignment.delete', 'Remove')}
                        className="text-destructive hover:text-destructive"
                        data-testid={`role-button-unassign-${a.id}`}
                    >
                        <Trash2 size={14} />
                    </Button>
                </div>
            ),
        },
    ];

    if (loading && !role) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#3B82F6]/30 border-t-[#3B82F6]" />
            </div>
        );
    }

    if (!role) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3">
                <p className="text-[13px] text-muted-foreground">{t('detail.notFound', 'Role not found')}</p>
                <Button size="sm" variant="outline" onClick={() => navigate('/settings/roles')}>
                    {t('detail.back', 'Back to roles')}
                </Button>
            </div>
        );
    }

    // Group permissions by plugin/domain for display
    const rolePermissions = permissions.filter((p) => role.permissions?.includes(p.key));
    const permissionsByPlugin: Record<string, Permission[]> = {};
    for (const p of rolePermissions) {
        const key = p.plugin || 'core';
        permissionsByPlugin[key] = permissionsByPlugin[key] ?? [];
        permissionsByPlugin[key].push(p);
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            <div className="shrink-0 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/settings/roles')}
                            data-testid="role-button-back"
                        >
                            <ArrowLeft size={14} className="mr-1" />
                            {t('detail.back', 'Roles')}
                        </Button>
                        <div className="flex items-center gap-2">
                            <Shield size={18} className="text-muted-foreground" />
                            <div>
                                <h1 className="text-[18px] font-semibold text-foreground">{role.name}</h1>
                                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                                    {role.template_key && (
                                        <span className="font-mono">{role.template_key}</span>
                                    )}
                                    <Badge variant={role.status === 'active' ? 'default' : 'secondary'}>
                                        {t(`status.${role.status}`, role.status)}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowEditModal(true)}
                        data-testid="role-button-edit-detail"
                    >
                        <Edit size={14} className="mr-1.5" />
                        {t('detail.edit', 'Edit Role')}
                    </Button>
                </div>

                {role.description && (
                    <p className="text-[13px] text-muted-foreground">{role.description}</p>
                )}

                <div className="grid grid-cols-3 gap-3">
                    <Card className="p-3">
                        <div className="text-2xl font-bold">{role.permissions?.length ?? 0}</div>
                        <div className="text-xs text-muted-foreground">{t('detail.stats.permissions', 'Permissions')}</div>
                    </Card>
                    <Card className="p-3">
                        <div className="text-2xl font-bold">{role.assignment_count}</div>
                        <div className="text-xs text-muted-foreground">{t('detail.stats.assignments', 'Active assignments')}</div>
                    </Card>
                    <Card className="p-3">
                        <div className="text-2xl font-bold">{Object.keys(permissionsByPlugin).length}</div>
                        <div className="text-xs text-muted-foreground">{t('detail.stats.plugins', 'Plugins covered')}</div>
                    </Card>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
                <Card className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-[14px] font-semibold">{t('detail.permissionsTitle', 'Permissions')}</h2>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowEditModal(true)}
                            data-testid="role-button-edit-permissions"
                        >
                            <Edit size={13} className="mr-1" />
                            {t('detail.editPermissions', 'Edit')}
                        </Button>
                    </div>
                    {Object.keys(permissionsByPlugin).length === 0 ? (
                        <div className="py-6 text-center text-[13px] text-muted-foreground">
                            {t('detail.noPermissions', 'This role has no permissions assigned.')}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {Object.entries(permissionsByPlugin)
                                .sort(([a], [b]) => a.localeCompare(b))
                                .map(([plugin, perms]) => (
                                    <div key={plugin} className="rounded-md border border-border p-2.5">
                                        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            {t(`plugin.${plugin}`, plugin)} ({perms.length})
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {perms.map((p) => (
                                                <Badge key={p.key} variant="outline" className="font-mono text-[10.5px]">
                                                    {p.key}
                                                </Badge>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </div>
                    )}
                </Card>

                <Card className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-[14px] font-semibold">
                            {t('detail.assignmentsTitle', 'Assignments')}{' '}
                            <span className="text-[12px] font-normal text-muted-foreground">
                                ({assignments.length})
                            </span>
                        </h2>
                        <Button
                            size="sm"
                            onClick={() => setShowAssignmentModal(true)}
                            data-testid="role-button-assign"
                        >
                            <UserPlus size={13} className="mr-1" />
                            {t('detail.addAssignment', 'Assign')}
                        </Button>
                    </div>
                    <div className="rounded-md border border-border">
                        <DataTable
                            embedded
                            paginate={false}
                            loading={assignmentsLoading}
                            columns={assignmentColumns}
                            data={assignments}
                            rowKey={(a) => a.id}
                            emptyIcon={<KeyRound size={28} strokeWidth={1.2} />}
                            emptyTitle={t('detail.noAssignmentsTitle', 'No assignments yet')}
                            emptyDescription={t(
                                'detail.noAssignmentsHint',
                                'Assign accounts to this role to grant scoped access.',
                            )}
                            emptyAction={{
                                label: t('detail.addAssignment', 'Assign'),
                                icon: <UserPlus size={14} />,
                                onClick: () => setShowAssignmentModal(true),
                                'data-testid': 'role-button-assign-empty',
                            }}
                        />
                    </div>
                </Card>
            </div>

            <RoleModal
                open={showEditModal}
                role={role}
                permissions={permissions}
                onOpenChange={(open) => !open && setShowEditModal(false)}
                onSaved={() => {
                    setShowEditModal(false);
                    void load();
                }}
            />

            <AssignmentModal
                open={showAssignmentModal}
                role={role}
                onOpenChange={(open) => !open && setShowAssignmentModal(false)}
                onSaved={() => {
                    setShowAssignmentModal(false);
                    void loadAssignments();
                    void load();
                }}
            />

            <AppModal
                open={!!deletingAssignment}
                onOpenChange={(open) => !open && setDeletingAssignment(null)}
                title={
                    <span className="flex items-center gap-2 text-destructive">
                        <Trash2 size={16} />
                        {t('assignment.deleteTitle', 'Remove Assignment')}
                    </span>
                }
                size="xs"
                style={{ maxWidth: '22rem' }}
                showCancelButton
                cancelLabel={t('modal.cancel')}
                cancelDisabled={deleteLoading}
                primaryAction={{
                    label: deleteLoading ? t('delete.loading') : t('assignment.deleteConfirm', 'Remove'),
                    variant: 'outline',
                    className:
                        'border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20',
                    onClick: handleDeleteAssignment,
                    loading: deleteLoading,
                    disabled: deleteLoading,
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    {t('assignment.deleteHint', 'Remove this account from the role? They will lose the scoped permissions immediately.')}
                </p>
            </AppModal>
        </div>
    );
}
