import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Zone, ZoneFormData } from '../types';

interface ZonesPagination {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
}

interface ZonesResponse {
    data: Zone[];
    total: number;
    page: number;
    limit: number;
}

interface UseZonesReturn {
    zones: Zone[];
    loading: boolean;
    error: string | null;
    pagination: ZonesPagination;
    sortBy: string | null;
    sortDir: 'asc' | 'desc' | null;
    fetchZones: () => Promise<void>;
    fetchZone: (id: string) => Promise<Zone | null>;
    createZone: (data: ZoneFormData) => Promise<Zone | null>;
    updateZone: (id: string, data: ZoneFormData, mapFile?: File | null) => Promise<boolean>;
    deleteZone: (id: string) => Promise<boolean>;
    changePage: (page: number) => void;
    changePageSize: (size: number) => void;
    changeSort: (col: string | null, dir: 'asc' | 'desc' | null) => void;
}

export function useZones(): UseZonesReturn {
    const { t } = useTranslation('zones');
    const [zones, setZones] = useState<Zone[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<string | null>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>('asc');
    const [pagination, setPagination] = useState<ZonesPagination>({
        page: 1,
        limit: 200,
        total: 0,
        total_pages: 0,
    });

    const fetchZones = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
            });
            if (sortBy) params.set('sort_by', sortBy);
            if (sortDir) params.set('sort_order', sortDir);
            const response = await apiFetch<ZonesResponse>(`/api/v1/access/zones?${params}`);
            setZones(response.data ?? []);
            setPagination((prev) => ({
                ...prev,
                total: response.total ?? 0,
                total_pages: Math.ceil((response.total ?? 0) / prev.limit),
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch zones';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, sortBy, sortDir]);

    const fetchZone = useCallback(async (id: string): Promise<Zone | null> => {
        try {
            const z = await apiFetch<Zone>(`/api/v1/access/zones/${id}`);
            return z;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch zone';
            setError(message);
            return null;
        }
    }, []);

    const createZone = useCallback(
        async (data: ZoneFormData): Promise<Zone | null> => {
            try {
                const payload: ZoneFormData = {
                    ...data,
                    parent_id: data.parent_id || undefined,
                    description: data.description || undefined,
                };
                const created = await apiFetch<Zone>('/api/v1/access/zones', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                await fetchZones();
                toast(t('toast.created'), 'success');
                return created;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create zone';
                setError(message);
                toast(message, 'error');
                return null;
            }
        },
        [fetchZones, t],
    );

    const updateZone = useCallback(
        async (id: string, data: ZoneFormData, mapFile?: File | null): Promise<boolean> => {
            try {
                if (mapFile) {
                    // Multipart path: zone fields + new map image in one request.
                    // The backend replaces map_image_url / width / height from the
                    // decoded image, so we strip them from the form fields here.
                    const fd = new FormData();
                    const put = (key: string, value: unknown) => {
                        if (value === undefined || value === null) return;
                        fd.append(key, String(value));
                    };
                    put('name', data.name);
                    put('description', data.description ?? '');
                    put('parent_id', data.parent_id ?? '');
                    put('address', data.address ?? '');
                    put('floor', data.floor ?? '');
                    put('building', data.building ?? '');
                    if (data.geo_lat != null) put('latitude', data.geo_lat);
                    if (data.geo_lng != null) put('longitude', data.geo_lng);
                    fd.append('map', mapFile);
                    await apiFetch<Zone>(`/api/v1/access/zones/${id}`, {
                        method: 'PUT',
                        body: fd,
                    });
                } else {
                    const payload: ZoneFormData = {
                        ...data,
                        parent_id: data.parent_id || undefined,
                        description: data.description || undefined,
                    };
                    await apiFetch<Zone>(`/api/v1/access/zones/${id}`, {
                        method: 'PUT',
                        body: JSON.stringify(payload),
                    });
                }
                await fetchZones();
                toast(t('toast.updated'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update zone';
                setError(message);
                toast(message, 'error');
                return false;
            }
        },
        [fetchZones, t],
    );

    const deleteZone = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch<void>(`/api/v1/access/zones/${id}`, { method: 'DELETE' });
                await fetchZones();
                toast(t('toast.deleted'), 'success');
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete zone';
                setError(message);
                throw err;
            }
        },
        [fetchZones, t],
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
        fetchZones();
    }, [fetchZones]);

    return {
        zones,
        loading,
        error,
        pagination,
        sortBy,
        sortDir,
        fetchZones,
        fetchZone,
        createZone,
        updateZone,
        deleteZone,
        changePage,
        changePageSize,
        changeSort,
    };
}
