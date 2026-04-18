import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { AccessPoint, AccessPointFormData, Zone, AccessTime } from '../types';

interface AccessPointPagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

interface AccessPointFilters {
    search: string;
    zone_id: string;
}

interface UseAccessPointsReturn {
    accessPoints: AccessPoint[];
    zones: Zone[];
    accessTimes: AccessTime[];
    loading: boolean;
    error: string | null;
    pagination: AccessPointPagination;
    filters: AccessPointFilters;
    sortBy: string | null;
    sortDir: 'asc' | 'desc' | null;

    fetchAccessPoints: () => Promise<void>;
    createAccessPoint: (data: AccessPointFormData) => Promise<boolean>;
    updateAccessPoint: (id: string, data: AccessPointFormData) => Promise<boolean>;
    deleteAccessPoint: (id: string) => Promise<boolean>;
    updateFilters: (partial: Partial<AccessPointFilters>) => void;
    changePage: (page: number) => void;
    changePageSize: (size: number) => void;
    changeSort: (col: string | null, dir: 'asc' | 'desc' | null) => void;
}

const initialFilters: AccessPointFilters = {
    search: '',
    zone_id: '',
};

export function useAccessPoints(): UseAccessPointsReturn {
    const { t } = useTranslation('accessPoints');
    const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
    const [zones, setZones] = useState<Zone[]>([]);
    const [accessTimes, setAccessTimes] = useState<AccessTime[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<AccessPointPagination>({
        page: 1,
        limit: 20,
        total: 0,
        total_pages: 0,
    });
    const [filters, setFilters] = useState<AccessPointFilters>(initialFilters);
    const [sortBy, setSortBy] = useState<string | null>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');

    // Fetch supporting lists (zones, access times) once on mount
    const fetchZones = useCallback(async () => {
        try {
            const data = await apiFetch<{ zones?: Zone[]; data?: Zone[] }>('/api/v1/access/zones?limit=100');
            setZones(data.zones ?? data.data ?? []);
        } catch (err) {
            console.error('Failed to fetch zones:', err);
        }
    }, []);

    const fetchAccessTimes = useCallback(async () => {
        try {
            const data = await apiFetch<{ data?: AccessTime[] }>('/api/v1/access/access-times?limit=100');
            setAccessTimes(data.data ?? []);
        } catch (err) {
            console.error('Failed to fetch access times:', err);
        }
    }, []);

    const fetchAccessPoints = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(filters.search && { search: filters.search }),
                ...(filters.zone_id && { zone_id: filters.zone_id }),
            });
            if (sortBy) params.set('sort_by', sortBy);
            if (sortDir) params.set('sort_order', sortDir);

            const data = await apiFetch<{
                access_points?: AccessPoint[];
                data?: AccessPoint[];
                pagination?: { total: number; total_pages: number };
                total?: number;
                total_pages?: number;
            }>(`/api/v1/access/access-points?${params}`);

            setAccessPoints(data.access_points ?? data.data ?? []);
            setPagination((prev) => ({
                ...prev,
                total: data.pagination?.total ?? data.total ?? 0,
                total_pages: data.pagination?.total_pages ?? data.total_pages ?? 0,
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch access points';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters, sortBy, sortDir]);

    const createAccessPoint = useCallback(
        async (data: AccessPointFormData): Promise<boolean> => {
            try {
                await apiFetch('/api/v1/access/access-points', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                await fetchAccessPoints();
                toast(t('toast.created'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create access point';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessPoints, t],
    );

    const updateAccessPoint = useCallback(
        async (id: string, data: AccessPointFormData): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-points/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
                await fetchAccessPoints();
                toast(t('toast.updated'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update access point';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessPoints, t],
    );

    const deleteAccessPoint = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-points/${id}`, { method: 'DELETE' });
                await fetchAccessPoints();
                toast(t('toast.deleted'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete access point';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchAccessPoints, t],
    );

    const updateFilters = useCallback((partial: Partial<AccessPointFilters>) => {
        setFilters((prev) => ({ ...prev, ...partial }));
        setPagination((prev) => ({ ...prev, page: 1 }));
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
        fetchZones();
        fetchAccessTimes();
    }, [fetchZones, fetchAccessTimes]);

    useEffect(() => {
        fetchAccessPoints();
    }, [fetchAccessPoints]);

    return {
        accessPoints,
        zones,
        accessTimes,
        loading,
        error,
        pagination,
        filters,
        sortBy,
        sortDir,
        fetchAccessPoints,
        createAccessPoint,
        updateAccessPoint,
        deleteAccessPoint,
        updateFilters,
        changePage,
        changePageSize,
        changeSort,
    };
}
