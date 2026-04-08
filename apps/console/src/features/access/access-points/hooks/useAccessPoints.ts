import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
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

    fetchAccessPoints: () => Promise<void>;
    createAccessPoint: (data: AccessPointFormData) => Promise<boolean>;
    updateAccessPoint: (id: string, data: AccessPointFormData) => Promise<boolean>;
    deleteAccessPoint: (id: string) => Promise<boolean>;
    updateFilters: (partial: Partial<AccessPointFilters>) => void;
    changePage: (page: number) => void;
}

const initialFilters: AccessPointFilters = {
    search: '',
    zone_id: '',
};

export function useAccessPoints(): UseAccessPointsReturn {
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
    }, [pagination.page, pagination.limit, filters]);

    const createAccessPoint = useCallback(
        async (data: AccessPointFormData): Promise<boolean> => {
            try {
                await apiFetch('/api/v1/access/access-points', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                await fetchAccessPoints();
                return true;
            } catch (err) {
                console.error('Failed to create access point:', err);
                return false;
            }
        },
        [fetchAccessPoints],
    );

    const updateAccessPoint = useCallback(
        async (id: string, data: AccessPointFormData): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-points/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data),
                });
                await fetchAccessPoints();
                return true;
            } catch (err) {
                console.error('Failed to update access point:', err);
                return false;
            }
        },
        [fetchAccessPoints],
    );

    const deleteAccessPoint = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch(`/api/v1/access/access-points/${id}`, { method: 'DELETE' });
                await fetchAccessPoints();
                return true;
            } catch (err) {
                console.error('Failed to delete access point:', err);
                return false;
            }
        },
        [fetchAccessPoints],
    );

    const updateFilters = useCallback((partial: Partial<AccessPointFilters>) => {
        setFilters((prev) => ({ ...prev, ...partial }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const changePage = useCallback((page: number) => {
        setPagination((prev) => ({ ...prev, page }));
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
        fetchAccessPoints,
        createAccessPoint,
        updateAccessPoint,
        deleteAccessPoint,
        updateFilters,
        changePage,
    };
}
