import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, getToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Department, DepartmentFormData, DepartmentFilters, DepartmentUser, DepartmentImportData, DepartmentManager } from '../types';

interface DepartmentPagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

interface UseDepartmentManagementReturn {
    departments: Department[];
    loading: boolean;
    error: string | null;
    pagination: DepartmentPagination;
    filters: DepartmentFilters;
    managers: DepartmentManager[];
    managersLoading: boolean;
    sortBy: string | null;
    sortDir: 'asc' | 'desc' | null;

    // CRUD Operations
    fetchDepartments: () => Promise<void>;
    createDepartment: (data: DepartmentFormData) => Promise<boolean>;
    updateDepartment: (id: string, data: DepartmentFormData) => Promise<boolean>;
    deleteDepartment: (id: string) => Promise<boolean>;

    // Filtering & Pagination
    updateFilters: (newFilters: Partial<DepartmentFilters>) => void;
    resetFilters: () => void;
    changePage: (page: number) => void;
    changePageSize: (size: number) => void;
    handleSortChange: (col: string | null, dir: 'asc' | 'desc' | null) => void;

    // User Management
    getDepartmentUsers: (id: string) => Promise<DepartmentUser[]>;
    assignUsersToDetpartment: (departmentId: string, userIds: string[]) => Promise<boolean>;
    removeUserFromDepartment: (departmentId: string, userId: string) => Promise<boolean>;

    // Import/Export
    exportDepartments: (departmentIds?: string[]) => Promise<void>;
    importDepartments: (file: File) => Promise<boolean>;

    // Managers
    fetchManagers: () => Promise<void>;

    // Utility
    refreshDepartments: () => Promise<void>;
}

const initialFilters: DepartmentFilters = {
    search: '',
    status: '',
    manager: '',
    parent_id: '',
};

interface DepartmentListResponse {
    departments?: Department[];
    pagination?: { total?: number; total_pages?: number };
    total?: number;
    total_pages?: number;
}

interface DepartmentUsersResponse {
    users?: DepartmentUser[];
}

interface DepartmentImportResponse {
    success: number;
    errors?: DepartmentImportData[];
}

interface DepartmentManagersResponse {
    managers?: DepartmentManager[];
}

export function useDepartmentManagement(): UseDepartmentManagementReturn {
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<DepartmentPagination>({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0,
    });
    const [filters, setFilters] = useState<DepartmentFilters>(initialFilters);
    const [managers, setManagers] = useState<DepartmentManager[]>([]);
    const [managersLoading, setManagersLoading] = useState(false);
    const [sortBy, setSortBy] = useState<string | null>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');

    const { t } = useTranslation('departments');

    const fetchDepartments = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                page_size: pagination.limit.toString(),
                ...(filters.search && { search: filters.search }),
                ...(filters.status && { status: filters.status }),
                ...(filters.manager && { manager: filters.manager }),
                ...(filters.parent_id && { parent_id: filters.parent_id }),
                ...(sortBy && { sort_by: sortBy }),
                ...(sortDir && { sort_order: sortDir.toUpperCase() }),
            });

            const data = await apiFetch<DepartmentListResponse>(`/api/v1/identity/departments?${params}`);
            setDepartments(data.departments || []);
            setPagination((prev) => ({
                ...prev,
                total: data.pagination?.total ?? data.total ?? 0,
                total_pages: data.pagination?.total_pages ?? data.total_pages ?? 0,
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : t('toast.createFailed');
            setError(message);
            toast(message, 'error');
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters, sortBy, sortDir, t]);

    const createDepartment = useCallback(
        async (data: DepartmentFormData): Promise<boolean> => {
            try {
                await apiFetch('/api/v1/identity/departments', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                toast(t('toast.created'), 'success');
                await fetchDepartments();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : t('toast.createFailed');
                toast(message, 'error');
                return false;
            }
        },
        [fetchDepartments, t],
    );

    const updateDepartment = useCallback(
        async (id: string, data: DepartmentFormData): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/identity/departments/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
                toast(t('toast.updated'), 'success');
                await fetchDepartments();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : t('toast.updateFailed');
                toast(message, 'error');
                return false;
            }
        },
        [fetchDepartments, t],
    );

    const deleteDepartment = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/identity/departments/${id}`, { method: 'DELETE' });
                toast(t('toast.deleted'), 'success');
                await fetchDepartments();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : t('toast.deleteFailed');
                toast(message, 'error');
                return false;
            }
        },
        [fetchDepartments, t],
    );

    const getDepartmentUsers = useCallback(async (id: string): Promise<DepartmentUser[]> => {
        try {
            const data = await apiFetch<DepartmentUsersResponse>(`/api/v1/identity/departments/${id}/users`);
            return data.users || [];
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch department users';
            toast(message, 'error');
            return [];
        }
    }, []);

    const assignUsersToDetpartment = useCallback(
        async (departmentId: string, userIds: string[]): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/identity/departments/${departmentId}/users`, {
                    method: 'POST',
                    body: JSON.stringify({ user_ids: userIds }),
                });
                toast(t('toast.usersAssigned', { count: userIds.length }), 'success');
                await fetchDepartments();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to assign users';
                toast(message, 'error');
                return false;
            }
        },
        [fetchDepartments, t],
    );

    const removeUserFromDepartment = useCallback(
        async (departmentId: string, userId: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/identity/departments/${departmentId}/users/${userId}`, {
                    method: 'DELETE',
                });
                toast(t('toast.userRemoved'), 'success');
                await fetchDepartments();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to remove user';
                toast(message, 'error');
                return false;
            }
        },
        [fetchDepartments, t],
    );

    // Export returns a binary CSV blob, not JSON — stays as raw fetch but uses
    // the shared token helper instead of reaching into localStorage directly.
    const exportDepartments = useCallback(async (departmentIds?: string[]): Promise<void> => {
        try {
            const params = new URLSearchParams();
            if (departmentIds && departmentIds.length > 0) {
                params.append('ids', departmentIds.join(','));
            }

            const token = getToken();
            const response = await fetch(`/api/v1/identity/departments/export?${params}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!response.ok) {
                throw new Error('Failed to export departments');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `departments-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast(t('toast.exported'), 'success');
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to export departments';
            toast(message, 'error');
        }
    }, [t]);

    const importDepartments = useCallback(
        async (file: File): Promise<boolean> => {
            try {
                const formData = new FormData();
                formData.append('file', file);

                const result = await apiFetch<DepartmentImportResponse>('/api/v1/identity/departments/import', {
                    method: 'POST',
                    body: formData,
                });

                toast(t('toast.imported', { count: result.success }), 'success');

                if (result.errors && result.errors.length > 0) {
                    console.warn('Import warnings:', result.errors);
                }

                await fetchDepartments();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to import departments';
                toast(message, 'error');
                return false;
            }
        },
        [fetchDepartments, t],
    );

    const fetchManagers = useCallback(async () => {
        setManagersLoading(true);
        try {
            const data = await apiFetch<DepartmentManagersResponse>('/api/v1/identity/departments/managers');
            setManagers(data.managers || []);
        } catch (err) {
            console.error('Failed to fetch managers:', err);
            setManagers([]);
        } finally {
            setManagersLoading(false);
        }
    }, []);

    const updateFilters = useCallback((newFilters: Partial<DepartmentFilters>) => {
        setFilters((prev) => ({ ...prev, ...newFilters }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(initialFilters);
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const changePage = useCallback((page: number) => {
        setPagination((prev) => ({ ...prev, page }));
    }, []);

    const changePageSize = useCallback((size: number) => {
        setPagination((prev) => ({ ...prev, limit: size, page: 1 }));
    }, []);

    const handleSortChange = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
        setSortBy(col);
        setSortDir(dir);
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const refreshDepartments = useCallback(async () => {
        await fetchDepartments();
    }, [fetchDepartments]);

    useEffect(() => {
        fetchDepartments();
    }, [fetchDepartments]);

    return {
        departments,
        loading,
        error,
        pagination,
        filters,
        managers,
        managersLoading,
        sortBy,
        sortDir,

        fetchDepartments,
        createDepartment,
        updateDepartment,
        deleteDepartment,

        updateFilters,
        resetFilters,
        changePage,
        changePageSize,
        handleSortChange,

        getDepartmentUsers,
        assignUsersToDetpartment,
        removeUserFromDepartment,

        exportDepartments,
        importDepartments,

        fetchManagers,

        refreshDepartments,
    };
}
