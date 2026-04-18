import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { useTenantContext } from '../../../components/tenant';
import type {
  User,
  UserFilters,
  UserPagination,
  UserListResponse,
  Department,
  AccessGroup,
  FilterOptions,
  UserFormData,
  UpdateUserRequest,
  UserAccount,
  AvailableCompany,
  CompanyAssignmentRequest,
  CompanyRoleUpdateRequest,
} from '../types';

const API_BASE = '/api/v1';

export function useUserManagement() {
  const { t } = useTranslation('users');
  const { tenant } = useTenantContext();
  
  // State
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<UserPagination>({
    page: 1,
    limit: 20,
    total: 0,
    total_pages: 0,
  });
  
  const [filters, setFilters] = useState<UserFilters>({
    search: '',
    status: 'all',
    department_id: '',
    access_group_id: '',
    account_type: 'all',
    position: '',
    date_from: '',
    date_to: '',
    sort_by: 'full_name',
    sort_order: 'ASC',
  });
  
  // Reference data
  const [departments, setDepartments] = useState<Department[]>([]);
  const [accessGroups, setAccessGroups] = useState<AccessGroup[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);

  // Helper function to get auth headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('dm3-token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  // Fetch users with current filters and pagination
  const fetchUsers = useCallback(async () => {
    if (!tenant) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.search && { search: filters.search }),
        ...(filters.status !== 'all' && { status: filters.status }),
        ...(filters.department_id && { department_id: filters.department_id }),
        ...(filters.access_group_id && { access_group_id: filters.access_group_id }),
        ...(filters.account_type !== 'all' && { account_type: filters.account_type }),
        ...(filters.position && { position: filters.position }),
        ...(filters.date_from && { date_from: filters.date_from }),
        ...(filters.date_to && { date_to: filters.date_to }),
        ...(filters.sort_by && { sort_by: filters.sort_by }),
        ...(filters.sort_order && { sort_order: filters.sort_order }),
      });

      const response = await fetch(`${API_BASE}/users?${params}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch users: ${response.status}`);
      }

      const data: UserListResponse = await response.json();
      setUsers(data.users);
      setPagination(data.pagination);
      
    } catch (error) {
      console.error('Failed to fetch users:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch users';
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [tenant, pagination.page, pagination.limit, filters, getAuthHeaders]);

  // Fetch reference data (departments, access groups, positions)
  const fetchReferenceData = useCallback(async () => {
    if (!tenant) return;
    
    setReferenceDataLoading(true);
    try {
      // Use the new unified filter options endpoint
      const response = await fetch(`${API_BASE}/users/filter-options`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data: FilterOptions = await response.json();
        setDepartments(data.departments || []);
        setAccessGroups(data.access_groups || []);
        setPositions(data.positions || []);
      } else {
        throw new Error(`Failed to fetch filter options: ${response.status}`);
      }
      
    } catch (error) {
      console.error('Failed to fetch reference data:', error);
      const message = error instanceof Error ? error.message : 'Failed to load filter options';
      toast(message, 'error');
    } finally {
      setReferenceDataLoading(false);
    }
  }, [tenant, getAuthHeaders]);

  // Create new user
  const createUser = useCallback(async (userData: UserFormData): Promise<boolean> => {
    if (!tenant) return false;
    
    try {
      const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to create user: ${response.status}`);
      }

      toast(t('toast.created'), 'success');
      
      await fetchUsers();
      return true;
      
    } catch (error: any) {
      console.error('Failed to create user:', error);
      toast(error.message || t('toast.createFailed'), 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  // Update user
  const updateUser = useCallback(async (userId: string, userData: Partial<UpdateUserRequest>): Promise<boolean> => {
    if (!tenant) return false;
    
    try {
      // Update user information (business data only)
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to update user: ${response.status}`);
      }

      toast(t('toast.updated'), 'success');
      
      await fetchUsers();
      return true;
      
    } catch (error: any) {
      console.error('Failed to update user:', error);
      toast(error.message || t('toast.updateFailed'), 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  // Delete user
  const deleteUser = useCallback(async (userId: string): Promise<boolean> => {
    if (!tenant) return false;
    
    try {
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to delete user: ${response.status}`);
      }

      toast(t('toast.deleted'), 'success');
      
      await fetchUsers();
      return true;
      
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      toast(error.message || t('toast.deleteFailed'), 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  // Get user by ID
  const getUser = useCallback(async (userId: string): Promise<User | null> => {
    if (!tenant) return null;
    
    try {
      const response = await fetch(`${API_BASE}/users/${userId}`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to get user: ${response.status}`);
      }

      const data = await response.json();
      return data.user;
      
    } catch (error) {
      console.error('Failed to get user:', error);
      const message = error instanceof Error ? error.message : 'Failed to load user details';
      toast(message, 'error');
      return null;
    }
  }, [tenant, getAuthHeaders]);

  // Filter functions
  const updateFilters = useCallback((newFilters: Partial<UserFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({
      search: '',
      status: 'all',
      department_id: '',
      access_group_id: '',
      account_type: 'all',
      position: '',
      date_from: '',
      date_to: '',
      sort_by: '',
      sort_order: 'ASC',
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  // Pagination functions
  const changePage = useCallback((newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  }, []);

  const changePageSize = useCallback((newSize: number) => {
    setPagination(prev => ({
      ...prev,
      limit: newSize,
      page: 1, // Reset to first page
    }));
  }, []);

  // Initialize data
  useEffect(() => {
    if (tenant) {
      fetchReferenceData();
    }
  }, [tenant, fetchReferenceData]);

  // Fetch users when dependencies change
  useEffect(() => {
    if (tenant) {
      fetchUsers();
    }
  }, [tenant, fetchUsers]);

  // Bulk operations
  const bulkDeleteUsers = useCallback(async (userIds: string[], reason?: string): Promise<boolean> => {
    if (!tenant || userIds.length === 0) return false;
    
    try {
      const response = await fetch(`${API_BASE}/users/bulk/delete`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_ids: userIds,
          reason: reason || 'Bulk deletion from user management',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete users');
      }

      const result = await response.json();
      
      toast(t('toast.bulkDeleted', { count: userIds.length }), 'success');

      fetchUsers();
      return true;
      
    } catch (error) {
      console.error('Failed to delete users:', error);
      toast(error instanceof Error ? error.message : t('toast.bulkDeleteFailed'), 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  const bulkUpdateDepartment = useCallback(async (userIds: string[], departmentId: string): Promise<boolean> => {
    if (!tenant || userIds.length === 0 || !departmentId) return false;
    
    try {
      const response = await fetch(`${API_BASE}/users/bulk/update-department`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_ids: userIds,
          department_id: departmentId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update departments');
      }

      const result = await response.json();
      
      toast(t('toast.bulkDeptUpdated', { count: userIds.length }), 'success');

      fetchUsers();
      return true;
      
    } catch (error) {
      console.error('Failed to update departments:', error);
      toast(error instanceof Error ? error.message : 'Failed to update departments', 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  const bulkUpdateAccessGroup = useCallback(async (userIds: string[], accessGroupId: string): Promise<boolean> => {
    if (!tenant || userIds.length === 0 || !accessGroupId) return false;
    
    try {
      const response = await fetch(`${API_BASE}/users/bulk/update-access-group`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_ids: userIds,
          access_group_id: accessGroupId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update access groups');
      }

      const result = await response.json();
      
      toast(t('toast.bulkAccessGroupUpdated', { count: userIds.length }), 'success');

      fetchUsers();
      return true;
      
    } catch (error) {
      console.error('Failed to update access groups:', error);
      toast(error instanceof Error ? error.message : 'Failed to update access groups', 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  const bulkUpdateStatus = useCallback(async (userIds: string[], status: string, reason?: string): Promise<boolean> => {
    if (!tenant || userIds.length === 0 || !status) return false;
    
    const endpoint = status === 'suspended' 
      ? `${API_BASE}/users/bulk/suspend`
      : `${API_BASE}/users/bulk/approve`;
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          user_ids: userIds,
          reason: reason,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Failed to ${status} users`);
      }

      const result = await response.json();
      
      toast(t('toast.bulkStatusUpdated', { count: userIds.length }), 'success');

      fetchUsers();
      return true;
      
    } catch (error) {
      console.error(`Failed to ${status} users:`, error);
      toast(error instanceof Error ? error.message : `Failed to ${status} users`, 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, fetchUsers, t]);

  // Multi-Company operations
  const getUserCompanyMatrix = useCallback(async (userId: string): Promise<UserAccount | null> => {
    if (!tenant || !userId) return null;
    
    try {
      const response = await fetch(`${API_BASE}/accounts/${userId}/companies/matrix`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user company matrix: ${response.status}`);
      }

      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error('Failed to fetch user company matrix:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch user company information';
      toast(message, 'error');
      return null;
    }
  }, [tenant, getAuthHeaders]);

  const getAvailableCompanies = useCallback(async (userId: string): Promise<AvailableCompany[]> => {
    if (!tenant || !userId) return [];
    
    try {
      const response = await fetch(`${API_BASE}/accounts/${userId}/companies/available`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch available companies: ${response.status}`);
      }

      const data = await response.json();
      return data.companies || [];
      
    } catch (error) {
      console.error('Failed to fetch available companies:', error);
      const message = error instanceof Error ? error.message : 'Failed to fetch available companies';
      toast(message, 'error');
      return [];
    }
  }, [tenant, getAuthHeaders]);

  const addUserToCompany = useCallback(async (userId: string, assignment: CompanyAssignmentRequest): Promise<boolean> => {
    if (!tenant || !userId) return false;
    
    try {
      const response = await fetch(`${API_BASE}/accounts/${userId}/companies`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(assignment),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to add user to company');
      }

      const result = await response.json();
      
      toast(t('toast.companyAdded'), 'success');

      return true;
      
    } catch (error) {
      console.error('Failed to add user to company:', error);
      toast(error instanceof Error ? error.message : 'Failed to add user to company', 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, t]);

  const removeUserFromCompany = useCallback(async (userId: string, companyId: string): Promise<boolean> => {
    if (!tenant || !userId || !companyId) return false;
    
    try {
      const response = await fetch(`${API_BASE}/accounts/${userId}/companies/${companyId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to remove user from company');
      }

      const result = await response.json();
      
      toast(t('toast.companyRemoved'), 'success');

      return true;
      
    } catch (error) {
      console.error('Failed to remove user from company:', error);
      toast(error instanceof Error ? error.message : 'Failed to remove user from company', 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, t]);

  const updateUserCompanyRole = useCallback(async (userId: string, companyId: string, roleUpdate: CompanyRoleUpdateRequest): Promise<boolean> => {
    if (!tenant || !userId || !companyId) return false;
    
    try {
      const response = await fetch(`${API_BASE}/accounts/${userId}/companies/${companyId}/role`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(roleUpdate),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update user role');
      }

      const result = await response.json();
      
      toast(t('toast.roleUpdated'), 'success');

      return true;
      
    } catch (error) {
      console.error('Failed to update user role:', error);
      toast(error instanceof Error ? error.message : 'Failed to update user role', 'error');
      return false;
    }
  }, [tenant, getAuthHeaders, t]);

  return {
    // Data
    users,
    departments,
    accessGroups,
    positions,
    
    // State
    loading,
    referenceDataLoading,
    pagination,
    filters,
    
    // Actions
    createUser,
    updateUser,
    deleteUser,
    getUser,
    
    // Bulk operations
    bulkDeleteUsers,
    bulkUpdateDepartment,
    bulkUpdateAccessGroup,
    bulkUpdateStatus,
    
    // Multi-company operations
    getUserCompanyMatrix,
    getAvailableCompanies,
    addUserToCompany,
    removeUserFromCompany,
    updateUserCompanyRole,
    
    // Filters
    updateFilters,
    resetFilters,
    
    // Pagination
    changePage,
    changePageSize,
    
    // Refresh
    refresh: fetchUsers,
    refreshReferenceData: fetchReferenceData,
  };
}

