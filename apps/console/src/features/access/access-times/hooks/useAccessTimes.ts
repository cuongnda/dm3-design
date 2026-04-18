import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { AccessTime, AccessTimeFormData } from '../types';

interface AccessTimePagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

interface UseAccessTimesReturn {
    accessTimes: AccessTime[];
    loading: boolean;
    error: string | null;
    pagination: AccessTimePagination;
    sortBy: string | null;
    sortDir: 'asc' | 'desc' | null;
    fetchAccessTimes: () => Promise<void>;
    createAccessTime: (data: AccessTimeFormData) => Promise<boolean>;
    updateAccessTime: (id: string, data: AccessTimeFormData) => Promise<boolean>;
    deleteAccessTime: (id: string) => Promise<boolean>;
    getAccessTime: (id: string) => Promise<AccessTime | null>;
    changePage: (page: number) => void;
    changePageSize: (size: number) => void;
    changeSort: (col: string | null, dir: 'asc' | 'desc' | null) => void;
}

export function useAccessTimes(): UseAccessTimesReturn {
    const { t } = useTranslation('accessTimes');
    const [accessTimes, setAccessTimes] = useState<AccessTime[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string | null>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
    const [pagination, setPagination] = useState<AccessTimePagination>({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0,
    });

    const fetchAccessTimes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                include_slots: 'true',
            });
            if (sortBy) params.set('sort_by', sortBy);
            if (sortDir) params.set('sort_order', sortDir);
            const data = await apiFetch<any>(`/api/v1/access/access-times?${params}`);
            setAccessTimes(data.data ?? []);
            setPagination((prev) => ({
                ...prev,
                total: data.total ?? 0,
                total_pages: Math.ceil((data.total ?? 0) / (data.limit ?? prev.limit)),
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch access times';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, sortBy, sortDir]);

    const createAccessTime = useCallback(
        async (data: AccessTimeFormData): Promise<boolean> => {
            try {
                await apiFetch('/api/v1/access/access-times', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                await fetchAccessTimes();
                toast(t('toast.created'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create access time';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessTimes, t],
    );

    const updateAccessTime = useCallback(
        async (id: string, data: AccessTimeFormData): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-times/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
                await fetchAccessTimes();
                toast(t('toast.updated'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update access time';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessTimes, t],
    );

    const deleteAccessTime = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-times/${id}`, { method: 'DELETE' });
                await fetchAccessTimes();
                toast(t('toast.deleted'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete access time';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessTimes, t],
    );

    const getAccessTime = useCallback(async (id: string): Promise<AccessTime | null> => {
        try {
            const data = await apiFetch<any>(`/api/v1/access/access-times/${id}`);
            return data.access_time ?? data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch access time';
            setError(message);
            return null;
        }
    }, []);

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
        fetchAccessTimes();
    }, [fetchAccessTimes]);

    return {
        accessTimes,
        loading,
        error,
        pagination,
        sortBy,
        sortDir,
        fetchAccessTimes,
        createAccessTime,
        updateAccessTime,
        deleteAccessTime,
        getAccessTime,
        changePage,
        changePageSize,
        changeSort,
    };
}
