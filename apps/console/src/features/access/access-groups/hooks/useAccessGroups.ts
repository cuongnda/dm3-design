import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { AccessGroup, AccessGroupFormData } from '../types';

interface AccessGroupPagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
}

interface UseAccessGroupsReturn {
    accessGroups: AccessGroup[];
    loading: boolean;
    error: string | null;
    pagination: AccessGroupPagination;
    search: string;
    sortBy: string | null;
    sortDir: 'asc' | 'desc' | null;
    setSearch: (value: string) => void;
    fetchAccessGroups: () => Promise<void>;
    createAccessGroup: (data: AccessGroupFormData) => Promise<boolean>;
    updateAccessGroup: (id: string, data: AccessGroupFormData) => Promise<boolean>;
    deleteAccessGroup: (id: string) => Promise<boolean>;
    changePage: (page: number) => void;
    changePageSize: (size: number) => void;
    changeSort: (col: string | null, dir: 'asc' | 'desc' | null) => void;
}

export function useAccessGroups(): UseAccessGroupsReturn {
    const { t } = useTranslation('accessGroups');
    const [accessGroups, setAccessGroups] = useState<AccessGroup[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearchRaw] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const [sortBy, setSortBy] = useState<string | null>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
    const [pagination, setPagination] = useState<AccessGroupPagination>({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0,
    });

    const setSearch = useCallback((value: string) => {
        setSearchRaw(value);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(value);
            setPagination((prev) => ({ ...prev, page: 1 }));
        }, 300);
    }, []);

    const fetchAccessGroups = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
            });
            if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
            if (sortBy) params.set('sort_by', sortBy);
            if (sortDir) params.set('sort_order', sortDir);
            const data = await apiFetch<PaginatedResponse<AccessGroup>>(`/api/v1/access/access-groups?${params}`);
            setAccessGroups(data.data ?? []);
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
    }, [pagination.page, pagination.limit, debouncedSearch, sortBy, sortDir]);

    const createAccessGroup = useCallback(
        async (data: AccessGroupFormData): Promise<boolean> => {
            try {
                await apiFetch('/api/v1/access/access-groups', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                await fetchAccessGroups();
                toast(t('toast.created'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create access group';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessGroups, t],
    );

    const updateAccessGroup = useCallback(
        async (id: string, data: AccessGroupFormData): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-groups/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
                await fetchAccessGroups();
                toast(t('toast.updated'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update access group';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessGroups, t],
    );

    const deleteAccessGroup = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-groups/${id}`, { method: 'DELETE' });
                await fetchAccessGroups();
                toast(t('toast.deleted'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete access group';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessGroups, t],
    );

    const changePage = useCallback((page: number) => {
        setPagination((prev) => ({ ...prev, page }));
    }, []);

    const changePageSize = useCallback((size: number) => {
        setPagination((prev) => ({ ...prev, limit: size, page: 1 }));
    }, []);

    const changeSort = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
        setSortBy(col);
        setSortDir(dir);
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    useEffect(() => {
        fetchAccessGroups();
    }, [fetchAccessGroups]);

    return {
        accessGroups,
        loading,
        error,
        pagination,
        search,
        sortBy,
        sortDir,
        setSearch,
        fetchAccessGroups,
        createAccessGroup,
        updateAccessGroup,
        deleteAccessGroup,
        changePage,
        changePageSize,
        changeSort,
    };
}
