import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { AccessGroup, AccessGroupFormData } from '../types';

interface AccessGroupPagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

interface UseAccessGroupsReturn {
    accessGroups: AccessGroup[];
    loading: boolean;
    error: string | null;
    pagination: AccessGroupPagination;
    fetchAccessGroups: () => Promise<void>;
    createAccessGroup: (data: AccessGroupFormData) => Promise<boolean>;
    updateAccessGroup: (id: string, data: AccessGroupFormData) => Promise<boolean>;
    deleteAccessGroup: (id: string) => Promise<boolean>;
    changePage: (page: number) => void;
    changePageSize: (size: number) => void;
}

export function useAccessGroups(): UseAccessGroupsReturn {
    const [accessGroups, setAccessGroups] = useState<AccessGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<AccessGroupPagination>({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0,
    });

    const fetchAccessGroups = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
            });
            const data = await apiFetch<any>(`/api/v1/access/access-groups?${params}`);
            setAccessGroups(data.data ?? data.access_groups ?? data.items ?? []);
            const total = data.total ?? 0;
            setPagination((prev) => ({
                ...prev,
                total,
                total_pages: Math.ceil(total / prev.limit),
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch access groups';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit]);

    const createAccessGroup = useCallback(
        async (data: AccessGroupFormData): Promise<boolean> => {
            try {
                await apiFetch('/api/v1/access/access-groups', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                await fetchAccessGroups();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create access group';
                setError(message);
                return false;
            }
        },
        [fetchAccessGroups],
    );

    const updateAccessGroup = useCallback(
        async (id: string, data: AccessGroupFormData): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-groups/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
                await fetchAccessGroups();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update access group';
                setError(message);
                return false;
            }
        },
        [fetchAccessGroups],
    );

    const deleteAccessGroup = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-groups/${id}`, { method: 'DELETE' });
                await fetchAccessGroups();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete access group';
                setError(message);
                return false;
            }
        },
        [fetchAccessGroups],
    );

    const changePage = useCallback((page: number) => {
        setPagination((prev) => ({ ...prev, page }));
    }, []);

    const changePageSize = useCallback((size: number) => {
        setPagination((prev) => ({ ...prev, limit: size, page: 1 }));
    }, []);

    useEffect(() => {
        fetchAccessGroups();
    }, [fetchAccessGroups]);

    return {
        accessGroups,
        loading,
        error,
        pagination,
        fetchAccessGroups,
        createAccessGroup,
        updateAccessGroup,
        deleteAccessGroup,
        changePage,
        changePageSize,
    };
}
