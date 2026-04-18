import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    Building2,
    ChevronRight,
    Edit,
    Mail,
    Network,
    Trash2,
    UserRound,
    Users,
} from 'lucide-react';
import {
    AppModal,
    Badge,
    Button,
    Card,
    DataTable,
    type Column,
    useBreadcrumbStore,
} from '@dm3/ui';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import { DepartmentModal } from './components/DepartmentModal';
import { UserAssignModal } from './components/UserAssignModal';
import type { Department, DepartmentFormData, DepartmentUser } from './types';

interface ChildrenResponse {
    departments?: Department[];
}

interface UsersResponse {
    users?: DepartmentUser[];
}

export function DepartmentDetailPage() {
    const { t } = useTranslation('departments');
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const setLabel = useBreadcrumbStore((s) => s.setLabel);
    const clearLabel = useBreadcrumbStore((s) => s.clearLabel);

    const [department, setDepartment] = useState<Department | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [children, setChildren] = useState<Department[]>([]);
    const [childrenLoading, setChildrenLoading] = useState(false);
    const [directReports, setDirectReports] = useState<DepartmentUser[]>([]);
    const [reportsLoading, setReportsLoading] = useState(false);

    const [showEdit, setShowEdit] = useState(false);
    const [showAssign, setShowAssign] = useState(false);
    const [showDelete, setShowDelete] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        if (department?.name) setLabel(id, department.name);
        return () => { clearLabel(id); };
    }, [id, department?.name, setLabel, clearLabel]);

    const fetchDepartment = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const dept = await apiFetch<Department>(`/api/v1/identity/departments/${id}`);
            if (dept.parent_id && !dept.parent_name) {
                try {
                    const parent = await apiFetch<Department>(`/api/v1/identity/departments/${dept.parent_id}`);
                    dept.parent_name = parent.name;
                } catch {
                    // best-effort hydration
                }
            }
            setDepartment(dept);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load department';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [id]);

    const fetchChildren = useCallback(async () => {
        if (!id) return;
        setChildrenLoading(true);
        try {
            const data = await apiFetch<ChildrenResponse>(
                `/api/v1/identity/departments?parent_id=${id}&page_size=100`,
            );
            setChildren(data.departments ?? []);
        } catch {
            setChildren([]);
        } finally {
            setChildrenLoading(false);
        }
    }, [id]);

    const fetchReports = useCallback(async () => {
        if (!id) return;
        setReportsLoading(true);
        try {
            const data = await apiFetch<UsersResponse>(`/api/v1/identity/departments/${id}/users`);
            setDirectReports(data.users ?? []);
        } catch {
            setDirectReports([]);
        } finally {
            setReportsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchDepartment();
        fetchChildren();
        fetchReports();
    }, [fetchDepartment, fetchChildren, fetchReports]);

    const handleEditSubmit = async (data: DepartmentFormData) => {
        if (!id) return;
        try {
            await apiFetch(`/api/v1/identity/departments/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data),
            });
            toast(t('toast.updated'), 'success');
            setShowEdit(false);
            fetchDepartment();
        } catch (err) {
            const message = err instanceof Error ? err.message : t('toast.updateFailed');
            toast(message, 'error');
        }
    };

    const handleDeleteConfirm = async () => {
        if (!id) return;
        setDeleteLoading(true);
        setDeleteError(null);
        try {
            await apiFetch(`/api/v1/identity/departments/${id}`, { method: 'DELETE' });
            toast(t('toast.deleted'), 'success');
            navigate('/manage/departments');
        } catch (err) {
            const msg = err instanceof Error ? err.message : t('toast.deleteFailed');
            setDeleteError(msg.replace(/^API \d+: /, ''));
            toast(msg, 'error');
        } finally {
            setDeleteLoading(false);
        }
    };

    const reportsColumns = useMemo(
        (): Column<DepartmentUser>[] => [
            {
                key: 'name',
                header: t('assign.colUser'),
                render: (u) => (
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium text-primary">
                            {((u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '')).toUpperCase() || '?'}
                        </div>
                        <div>
                            <div className="text-[13px] font-medium">
                                {u.first_name} {u.last_name}
                            </div>
                            <div className="text-[11px] text-muted-foreground">#{u.user_code}</div>
                        </div>
                    </div>
                ),
            },
            {
                key: 'email',
                header: t('assign.colEmail'),
                render: (u) => (
                    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <Mail size={12} />
                        {u.email}
                    </span>
                ),
            },
            {
                key: 'position',
                header: t('assign.colPosition'),
                render: (u) =>
                    u.position ? (
                        <span className="text-[12px]">{u.position}</span>
                    ) : (
                        <span className="text-[12px] text-muted-foreground">—</span>
                    ),
            },
            {
                key: 'status',
                header: t('assign.colStatus'),
                width: '96px',
                render: (u) => (
                    <Badge variant={u.status === 'active' ? 'secondary' : 'outline'}>
                        {u.status === 'active' ? t('active') : t('inactive')}
                    </Badge>
                ),
            },
        ],
        [t],
    );

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
        );
    }

    if (error || !department) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <Building2 size={40} className="text-muted-foreground/40" strokeWidth={1.2} />
                <h2 className="text-[16px] font-semibold">{t('detail.notFound', 'Department not found')}</h2>
                <p className="text-[13px] text-muted-foreground">{error ?? t('detail.notFoundDesc', 'This department may have been deleted.')}</p>
                <Button variant="outline" size="sm" onClick={() => navigate('/manage/departments')}>
                    <ArrowLeft size={14} className="mr-1.5" />
                    {t('detail.backToList', 'Back to list')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 flex-col gap-4 overflow-hidden">
            {/* Header */}
            <div className="shrink-0 space-y-3">
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Link to="/manage/departments" className="hover:text-foreground">
                        {t('title')}
                    </Link>
                    {department.parent_id && department.parent_name && (
                        <>
                            <ChevronRight size={12} />
                            <Link to={`/manage/departments/${department.parent_id}`} className="hover:text-foreground">
                                {department.parent_name}
                            </Link>
                        </>
                    )}
                    <ChevronRight size={12} />
                    <span className="text-foreground">{department.name}</span>
                </div>

                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary/10">
                            <Building2 size={20} className="text-primary" />
                        </div>
                        <div>
                            <h1 className="text-[18px] font-semibold text-foreground">{department.name}</h1>
                            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                                <span>#{department.number}</span>
                                {department.manager_name ? (
                                    <Badge variant="secondary" className="gap-1">
                                        <UserRound size={11} />
                                        {department.manager_name}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">{t('noManager')}</Badge>
                                )}
                            </div>
                            {department.description && (
                                <p className="mt-1.5 max-w-2xl text-[12px] text-muted-foreground">{department.description}</p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowAssign(true)}>
                            <Users size={14} className="mr-1.5" />
                            {t('actions.manageUsers')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
                            <Edit size={14} className="mr-1.5" />
                            {t('actions.edit')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => { setDeleteError(null); setShowDelete(true); }}
                        >
                            <Trash2 size={14} className="mr-1.5" />
                            {t('actions.delete')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto xl:flex-row">
                {/* Main column: Direct reports + children */}
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                    {/* Direct reports */}
                    <Card className="p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users size={14} className="text-muted-foreground" />
                                <h2 className="text-[14px] font-semibold">{t('detail.directReports', 'Direct Reports')}</h2>
                                <Badge variant="secondary">{directReports.length}</Badge>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setShowAssign(true)}>
                                {t('actions.manageUsers')}
                            </Button>
                        </div>
                        {reportsLoading ? (
                            <div className="py-8 text-center text-[13px] text-muted-foreground">{t('detail.loading', 'Loading…')}</div>
                        ) : directReports.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                                <Users size={28} className="text-muted-foreground/40" strokeWidth={1.2} />
                                <p className="text-[13px] font-medium">{t('detail.emptyReports', 'No direct reports yet')}</p>
                                <p className="text-[12px] text-muted-foreground">{t('detail.emptyReportsDesc', 'Assign users to this department to see them here.')}</p>
                                <Button variant="outline" size="sm" className="mt-2" onClick={() => setShowAssign(true)}>
                                    <Users size={14} className="mr-1.5" />
                                    {t('assignUsers')}
                                </Button>
                            </div>
                        ) : (
                            <DataTable
                                embedded
                                paginate={false}
                                loading={false}
                                columns={reportsColumns}
                                data={directReports}
                                rowKey={(u) => u.id}
                                onRowClick={(u) => navigate(`/manage/users/${u.id}`)}
                            />
                        )}
                    </Card>

                    {/* Child departments */}
                    <Card className="p-4">
                        <div className="mb-3 flex items-center gap-2">
                            <Network size={14} className="text-muted-foreground" />
                            <h2 className="text-[14px] font-semibold">{t('detail.children', 'Child Departments')}</h2>
                            <Badge variant="secondary">{children.length}</Badge>
                        </div>
                        {childrenLoading ? (
                            <div className="py-6 text-center text-[13px] text-muted-foreground">{t('detail.loading', 'Loading…')}</div>
                        ) : children.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                                <Network size={26} className="text-muted-foreground/40" strokeWidth={1.2} />
                                <p className="text-[13px] font-medium">{t('detail.emptyChildren', 'No child departments')}</p>
                                <p className="text-[12px] text-muted-foreground">{t('detail.emptyChildrenDesc', 'Sub-departments you create with this as parent will appear here.')}</p>
                            </div>
                        ) : (
                            <div className="grid gap-2 sm:grid-cols-2">
                                {children.map((child) => (
                                    <Link
                                        key={child.id}
                                        to={`/manage/departments/${child.id}`}
                                        className="group flex items-center justify-between gap-2 rounded-md border border-border bg-card/40 p-3 transition-colors hover:border-ring/40 hover:bg-card"
                                    >
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Building2 size={14} className="shrink-0 text-primary" />
                                            <div className="min-w-0">
                                                <div className="truncate text-[13px] font-medium">{child.name}</div>
                                                <div className="text-[11px] text-muted-foreground">#{child.number}</div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Badge variant="outline" className="gap-1 text-[10px]">
                                                <Users size={10} />
                                                {child.user_count ?? 0}
                                            </Badge>
                                            <ChevronRight size={14} className="text-muted-foreground group-hover:text-foreground" />
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Right rail: mini org context */}
                <aside className="flex shrink-0 flex-col gap-3 xl:w-[280px]">
                    <Card className="p-4">
                        <h3 className="mb-3 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <Network size={12} />
                            {t('detail.orgContext', 'Organization')}
                        </h3>
                        <dl className="space-y-3 text-[12px]">
                            <div>
                                <dt className="text-muted-foreground">{t('manager')}</dt>
                                <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
                                    {department.manager_name ? (
                                        <>
                                            <UserRound size={12} className="text-primary" />
                                            {department.manager_name}
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">{t('noManager')}</span>
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground">{t('parentDepartment')}</dt>
                                <dd className="mt-0.5">
                                    {department.parent_id && department.parent_name ? (
                                        <Link
                                            to={`/manage/departments/${department.parent_id}`}
                                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                                        >
                                            <Building2 size={12} />
                                            {department.parent_name}
                                        </Link>
                                    ) : (
                                        <span className="text-muted-foreground">{t('noParent')}</span>
                                    )}
                                </dd>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <dt className="text-muted-foreground">{t('detail.userCount', 'Users')}</dt>
                                    <dd className="mt-0.5 text-[16px] font-semibold">{department.user_count ?? 0}</dd>
                                </div>
                                <div>
                                    <dt className="text-muted-foreground">{t('detail.childrenCount', 'Children')}</dt>
                                    <dd className="mt-0.5 text-[16px] font-semibold">{children.length}</dd>
                                </div>
                            </div>
                        </dl>
                    </Card>

                    <Card className="p-4">
                        <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {t('detail.meta', 'Metadata')}
                        </h3>
                        <dl className="space-y-2 text-[12px]">
                            <div className="flex justify-between gap-2">
                                <dt className="text-muted-foreground">{t('number')}</dt>
                                <dd className="font-mono">{department.number}</dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-muted-foreground">{t('status')}</dt>
                                <dd>
                                    <Badge variant={department.status === 'active' ? 'secondary' : 'outline'}>
                                        {department.status === 'active' ? t('active') : t('inactive')}
                                    </Badge>
                                </dd>
                            </div>
                            <div className="flex justify-between gap-2">
                                <dt className="text-muted-foreground">{t('col.created')}</dt>
                                <dd>{new Date(department.created_on || department.created_at).toLocaleDateString()}</dd>
                            </div>
                        </dl>
                    </Card>
                </aside>
            </div>

            {/* Edit modal */}
            <DepartmentModal
                isOpen={showEdit}
                onClose={() => setShowEdit(false)}
                onSubmit={handleEditSubmit}
                department={department}
                title={t('editDepartment')}
            />

            {/* Assign users modal */}
            <UserAssignModal
                isOpen={showAssign}
                onClose={() => { setShowAssign(false); fetchReports(); fetchDepartment(); }}
                department={department}
            />

            {/* Delete dialog */}
            <AppModal
                open={showDelete}
                onOpenChange={(open) => { if (!open) { setShowDelete(false); setDeleteError(null); } }}
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
                    {t('delete.confirmPre')} <span className="font-medium text-foreground">"{department.name}"</span>
                    {t('delete.confirmPost')}
                    {(department.user_count || 0) > 0 && (
                        <span className="mt-2 block text-destructive">
                            {t('delete.usersWarning', { count: department.user_count })}
                        </span>
                    )}
                </p>
            </AppModal>
        </div>
    );
}
