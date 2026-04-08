import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
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
  fetchAccessTimes: () => Promise<void>;
  createAccessTime: (data: AccessTimeFormData) => Promise<boolean>;
  updateAccessTime: (id: string, data: AccessTimeFormData) => Promise<boolean>;
  deleteAccessTime: (id: string) => Promise<boolean>;
  getAccessTime: (id: string) => Promise<AccessTime | null>;
  changePage: (page: number) => void;
  changePageSize: (size: number) => void;
}

export function useAccessTimes(): UseAccessTimesReturn {
  const [accessTimes, setAccessTimes] = useState<AccessTime[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      });
      const data = await apiFetch(`/api/v1/access-times?${params}`);
      setAccessTimes(data.data ?? []);
      setPagination(prev => ({
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
  }, [pagination.page, pagination.limit]);

  const createAccessTime = useCallback(async (data: AccessTimeFormData): Promise<boolean> => {
    try {
      await apiFetch('/api/v1/access-times', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      await fetchAccessTimes();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create access time';
      setError(message);
      return false;
    }
  }, [fetchAccessTimes]);

  const updateAccessTime = useCallback(async (id: string, data: AccessTimeFormData): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/access-times/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      await fetchAccessTimes();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update access time';
      setError(message);
      return false;
    }
  }, [fetchAccessTimes]);

  const deleteAccessTime = useCallback(async (id: string): Promise<boolean> => {
    try {
      await apiFetch(`/api/v1/access-times/${id}`, { method: 'DELETE' });
      await fetchAccessTimes();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete access time';
      setError(message);
      return false;
    }
  }, [fetchAccessTimes]);

  const getAccessTime = useCallback(async (id: string): Promise<AccessTime | null> => {
    try {
      const data = await apiFetch(`/api/v1/access-times/${id}`);
      return data.access_time ?? data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch access time';
      setError(message);
      return null;
    }
  }, []);

  const changePage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const changePageSize = useCallback((size: number) => {
    setPagination(prev => ({ ...prev, limit: size, page: 1 }));
  }, []);

  useEffect(() => {
    fetchAccessTimes();
  }, [fetchAccessTimes]);

  return {
    accessTimes,
    loading,
    error,
    pagination,
    fetchAccessTimes,
    createAccessTime,
    updateAccessTime,
    deleteAccessTime,
    getAccessTime,
    changePage,
    changePageSize,
  };
}
