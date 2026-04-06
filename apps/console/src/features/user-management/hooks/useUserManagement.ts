import { useState, useCallback, useEffect } from 'react';
// import { useToast } from '@dm3/ui';
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
  // const { showToast } = useToast();
  const showToast = (options: any) => console.log('Toast:', options.title, options.description);
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
      showToast({
        title: 'Error',
        description: 'Failed to fetch users. Please try again.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [tenant, pagination.page, pagination.limit, filters, getAuthHeaders, showToast]);

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
      showToast({
        title: 'Warning',
        description: 'Failed to load filter options.',
        type: 'error',
      });
    } finally {
      setReferenceDataLoading(false);
    }
  }, [tenant, getAuthHeaders, showToast]);

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

      showToast({
        title: 'Success',
        description: 'User created successfully.',
      });
      
      // Refresh user list
      await fetchUsers();
      return true;
      
    } catch (error: any) {
      console.error('Failed to create user:', error);
      showToast({
        title: 'Error',
        description: error.message || 'Failed to create user. Please try again.',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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

      showToast({
        title: 'Success',
        description: 'User updated successfully.',
      });
      
      // Refresh user list
      await fetchUsers();
      return true;
      
    } catch (error: any) {
      console.error('Failed to update user:', error);
      showToast({
        title: 'Error',
        description: error.message || 'Failed to update user. Please try again.',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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

      showToast({
        title: 'Success',
        description: 'User deleted successfully.',
      });
      
      // Refresh user list
      await fetchUsers();
      return true;
      
    } catch (error: any) {
      console.error('Failed to delete user:', error);
      showToast({
        title: 'Error',
        description: error.message || 'Failed to delete user. Please try again.',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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
      showToast({
        title: 'Error',
        description: 'Failed to load user details. Please try again.',
        type: 'error',
      });
      return null;
    }
  }, [tenant, getAuthHeaders, showToast]);

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
      
      showToast({
        title: 'Success',
        description: result.message || `Successfully deleted ${userIds.length} users`,
      });

      fetchUsers(); // Refresh the list
      return true;
      
    } catch (error) {
      console.error('Failed to delete users:', error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete users',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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
      
      showToast({
        title: 'Success',
        description: result.message || `Successfully updated department for ${userIds.length} users`,
      });

      fetchUsers(); // Refresh the list
      return true;
      
    } catch (error) {
      console.error('Failed to update departments:', error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update departments',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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
      
      showToast({
        title: 'Success',
        description: result.message || `Successfully updated access group for ${userIds.length} users`,
      });

      fetchUsers(); // Refresh the list
      return true;
      
    } catch (error) {
      console.error('Failed to update access groups:', error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update access groups',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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
      
      showToast({
        title: 'Success',
        description: result.message || `Successfully ${status} ${userIds.length} users`,
      });

      fetchUsers(); // Refresh the list
      return true;
      
    } catch (error) {
      console.error(`Failed to ${status} users:`, error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : `Failed to ${status} users`,
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, toast, fetchUsers]);

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
      showToast({
        title: 'Error',
        description: 'Failed to fetch user company information',
        type: 'error',
      });
      return null;
    }
  }, [tenant, getAuthHeaders, showToast]);

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
      showToast({
        title: 'Error',
        description: 'Failed to fetch available companies',
        type: 'error',
      });
      return [];
    }
  }, [tenant, getAuthHeaders, showToast]);

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
      
      showToast({
        title: 'Success',
        description: `User added to ${result.company_name} with role ${result.role}`,
      });

      return true;
      
    } catch (error) {
      console.error('Failed to add user to company:', error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add user to company',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, showToast]);

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
      
      showToast({
        title: 'Success',
        description: result.message || 'User removed from company successfully',
      });

      return true;
      
    } catch (error) {
      console.error('Failed to remove user from company:', error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove user from company',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, showToast]);

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
      
      showToast({
        title: 'Success',
        description: result.message || `Role updated to ${roleUpdate.role}`,
      });

      return true;
      
    } catch (error) {
      console.error('Failed to update user role:', error);
      showToast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update user role',
        type: 'error',
      });
      return false;
    }
  }, [tenant, getAuthHeaders, showToast]);

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

