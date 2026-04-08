import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { AccessDevice, AccessDeviceFormData } from '../types';

interface AccessDevicesPagination {
    page: number;
    limit: number;
    total: number;
}

interface AccessDevicesFilters {
    search: string;
    status: string;
}

interface AccessDevicesResponse {
    data: AccessDevice[];
    total: number;
    page: number;
    limit: number;
}

interface UseAccessDevicesReturn {
    accessDevices: AccessDevice[];
    loading: boolean;
    error: string | null;
    pagination: AccessDevicesPagination;
    filters: AccessDevicesFilters;
    fetchAccessDevices: () => Promise<void>;
    createAccessDevice: (data: AccessDeviceFormData) => Promise<boolean>;
    updateAccessDevice: (id: string, data: AccessDeviceFormData) => Promise<boolean>;
    deleteAccessDevice: (id: string) => Promise<boolean>;
    updateFilters: (partial: Partial<AccessDevicesFilters>) => void;
    changePage: (page: number) => void;
}

const initialFilters: AccessDevicesFilters = {
    search: '',
    status: '',
};

export function useAccessDevices(): UseAccessDevicesReturn {
    const [accessDevices, setAccessDevices] = useState<AccessDevice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<AccessDevicesPagination>({
        page: 1,
        limit: 20,
        total: 0,
    });
    const [filters, setFilters] = useState<AccessDevicesFilters>(initialFilters);

    const fetchAccessDevices = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: pagination.limit.toString(),
                ...(filters.search && { search: filters.search }),
                ...(filters.status && { status: filters.status }),
            });
            const response = await apiFetch<AccessDevicesResponse>(`/api/v1/access/access-devices?${params}`);
            setAccessDevices(response.data ?? []);
            setPagination((prev) => ({
                ...prev,
                total: response.total ?? 0,
            }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch access devices';
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters]);

    const createAccessDevice = useCallback(
        async (data: AccessDeviceFormData): Promise<boolean> => {
            try {
                const payload: AccessDeviceFormData = {
                    ...data,
                    device_id: data.device_id || undefined,
                };
                await apiFetch<AccessDevice>('/api/v1/access/access-devices', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                await fetchAccessDevices();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create access device';
                setError(message);
                return false;
            }
        },
        [fetchAccessDevices],
    );

    const updateAccessDevice = useCallback(
        async (id: string, data: AccessDeviceFormData): Promise<boolean> => {
            try {
                const payload: AccessDeviceFormData = {
                    ...data,
                    device_id: data.device_id || undefined,
                };
                await apiFetch<AccessDevice>(`/api/v1/access/access-devices/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload),
                });
                await fetchAccessDevices();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update access device';
                setError(message);
                return false;
            }
        },
        [fetchAccessDevices],
    );

    const deleteAccessDevice = useCallback(
        async (id: string): Promise<boolean> => {
            try {
                await apiFetch<void>(`/api/v1/access/access-devices/${id}`, { method: 'DELETE' });
                await fetchAccessDevices();
                return true;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete access device';
                setError(message);
                return false;
            }
        },
        [fetchAccessDevices],
    );

    const updateFilters = useCallback((partial: Partial<AccessDevicesFilters>) => {
        setFilters((prev) => ({ ...prev, ...partial }));
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, []);

    const changePage = useCallback((page: number) => {
        setPagination((prev) => ({ ...prev, page }));
    }, []);

    useEffect(() => {
        fetchAccessDevices();
    }, [fetchAccessDevices]);

    return {
        accessDevices,
        loading,
        error,
        pagination,
        filters,
        fetchAccessDevices,
        createAccessDevice,
        updateAccessDevice,
        deleteAccessDevice,
        updateFilters,
        changePage,
    };
}
