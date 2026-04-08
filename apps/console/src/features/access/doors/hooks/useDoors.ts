import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import type { Door, DoorFormData } from '../types';

interface DoorsPagination {
  page: number;
  limit: number;
  total: number;
}

interface DoorsFilters {
  search: string;
  status: string;
}

interface DoorsResponse {
  data: Door[];
  total: number;
  page: number;
  limit: number;
}

interface UseDoorsReturn {
  doors: Door[];
  loading: boolean;
  error: string | null;
  pagination: DoorsPagination;
  filters: DoorsFilters;
  fetchDoors: () => Promise<void>;
  createDoor: (data: DoorFormData) => Promise<boolean>;
  updateDoor: (id: string, data: DoorFormData) => Promise<boolean>;
  deleteDoor: (id: string) => Promise<boolean>;
  updateFilters: (partial: Partial<DoorsFilters>) => void;
  changePage: (page: number) => void;
}

const initialFilters: DoorsFilters = {
  search: '',
  status: '',
};

export function useDoors(): UseDoorsReturn {
  const [doors, setDoors] = useState<Door[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<DoorsPagination>({
    page: 1,
    limit: 20,
    total: 0,
  });
  const [filters, setFilters] = useState<DoorsFilters>(initialFilters);

  const fetchDoors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.search && { search: filters.search }),
        ...(filters.status && { status: filters.status }),
      });
      const response = await apiFetch<DoorsResponse>(`/api/v1/doors?${params}`);
      setDoors(response.data ?? []);
      setPagination((prev) => ({
        ...prev,
        total: response.total ?? 0,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch doors';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters]);

  const createDoor = useCallback(async (data: DoorFormData): Promise<boolean> => {
    try {
      const payload: DoorFormData = {
        ...data,
        device_id: data.device_id || undefined,
      };
      await apiFetch<Door>('/api/v1/doors', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await fetchDoors();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create door';
      setError(message);
      return false;
    }
  }, [fetchDoors]);

  const updateDoor = useCallback(async (id: string, data: DoorFormData): Promise<boolean> => {
    try {
      const payload: DoorFormData = {
        ...data,
        device_id: data.device_id || undefined,
      };
      await apiFetch<Door>(`/api/v1/doors/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      await fetchDoors();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update door';
      setError(message);
      return false;
    }
  }, [fetchDoors]);

  const deleteDoor = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiFetch<void>(`/api/v1/doors/${id}`, { method: 'DELETE' });
      await fetchDoors();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete door';
      setError(message);
      return false;
    }
  }, [fetchDoors]);

  const updateFilters = useCallback((partial: Partial<DoorsFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchDoors();
  }, [fetchDoors]);

  return {
    doors,
    loading,
    error,
    pagination,
    filters,
    fetchDoors,
    createDoor,
    updateDoor,
    deleteDoor,
    updateFilters,
    changePage,
  };
}
