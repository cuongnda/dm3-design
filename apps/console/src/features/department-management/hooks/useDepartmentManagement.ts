import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { apiFetch } from '@/lib/api';
import type { 
  Department, 
  DepartmentFormData, 
  DepartmentFilters, 
  DepartmentUser,
  DepartmentImportData,
  DepartmentManager
} from '../types';

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

  const user = useAuthStore((s) => s.user);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('dm3-token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const showToast = (options: { title: string; description: string; variant?: 'default' | 'destructive' }) => {
    console.log('Toast:', options.title, options.description);
  };

  // Fetch departments with search and filters
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

      const response = await fetch(`/api/v1/departments?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch departments');
      }

      const data = await response.json();
      setDepartments(data.departments || []);
      setPagination(prev => ({
        ...prev,
        total: data.pagination?.total ?? data.total ?? 0,
        total_pages: data.pagination?.total_pages ?? data.total_pages ?? 0,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch departments';
      setError(message);
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, sortBy, sortDir]);

  // Create department
  const createDepartment = useCallback(async (data: DepartmentFormData): Promise<boolean> => {
    try {
      const response = await fetch('/api/v1/departments', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create department');
      }

      showToast({
        title: 'Success',
        description: 'Department created successfully',
      });

      await fetchDepartments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create department';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchDepartments]);

  // Update department
  const updateDepartment = useCallback(async (id: string, data: DepartmentFormData): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/departments/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update department');
      }

      showToast({
        title: 'Success',
        description: 'Department updated successfully',
      });

      await fetchDepartments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update department';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchDepartments]);

  // Delete department
  const deleteDepartment = useCallback(async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/departments/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete department');
      }

      showToast({
        title: 'Success',
        description: 'Department deleted successfully',
      });

      await fetchDepartments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete department';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchDepartments]);

  // Get department users
  const getDepartmentUsers = useCallback(async (id: string): Promise<DepartmentUser[]> => {
    try {
      const response = await fetch(`/api/v1/departments/${id}/users`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch department users');
      }

      const data = await response.json();
      return data.users || [];
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch department users';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return [];
    }
  }, []);

  // Assign users to department
  const assignUsersToDetpartment = useCallback(async (departmentId: string, userIds: string[]): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/departments/${departmentId}/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ user_ids: userIds }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to assign users');
      }

      showToast({
        title: 'Success',
        description: `${userIds.length} users assigned successfully`,
      });

      await fetchDepartments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to assign users';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchDepartments]);

  // Remove user from department
  const removeUserFromDepartment = useCallback(async (departmentId: string, userId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/v1/departments/${departmentId}/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to remove user');
      }

      showToast({
        title: 'Success',
        description: 'User removed from department successfully',
      });

      await fetchDepartments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove user';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchDepartments]);

  // Export departments
  const exportDepartments = useCallback(async (departmentIds?: string[]): Promise<void> => {
    try {
      const params = new URLSearchParams();
      if (departmentIds && departmentIds.length > 0) {
        params.append('ids', departmentIds.join(','));
      }

      const response = await fetch(`/api/v1/departments/export?${params}`, {
        headers: getAuthHeaders(),
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

      showToast({
        title: 'Success',
        description: 'Departments exported successfully',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to export departments';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  }, []);

  // Import departments
  const importDepartments = useCallback(async (file: File): Promise<boolean> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/v1/departments/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('dm3-token')}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to import departments');
      }

      const result = await response.json();
      
      showToast({
        title: 'Success',
        description: `Imported ${result.success} departments successfully`,
      });

      if (result.errors && result.errors.length > 0) {
        console.warn('Import warnings:', result.errors);
      }

      await fetchDepartments();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import departments';
      showToast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
      return false;
    }
  }, [fetchDepartments]);

  // Fetch managers
  const fetchManagers = useCallback(async () => {
    setManagersLoading(true);
    
    try {
      const response = await fetch('/api/v1/accounts/managers', {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch managers');
      }

      const data = await response.json();
      setManagers(data.managers || []);
    } catch (err) {
      console.error('Failed to fetch managers:', err);
      setManagers([]);
    } finally {
      setManagersLoading(false);
    }
  }, []);

  // Filter and pagination handlers
  const updateFilters = useCallback((newFilters: Partial<DepartmentFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const changePageSize = useCallback((size: number) => {
    setPagination(prev => ({ ...prev, limit: size, page: 1 }));
  }, []);

  const handleSortChange = useCallback((col: string | null, dir: 'asc' | 'desc' | null) => {
    setSortBy(col);
    setSortDir(dir);
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const refreshDepartments = useCallback(async () => {
    await fetchDepartments();
  }, [fetchDepartments]);

  // Auto-fetch on filter/pagination changes
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

    // CRUD Operations
    fetchDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,

    // Filtering & Pagination
    updateFilters,
    resetFilters,
    changePage,
    changePageSize,
    handleSortChange,

    // User Management
    getDepartmentUsers,
    assignUsersToDetpartment,
    removeUserFromDepartment,

    // Import/Export
    exportDepartments,
    importDepartments,

    // Managers
    fetchManagers,

    // Utility
    refreshDepartments,
  };
}