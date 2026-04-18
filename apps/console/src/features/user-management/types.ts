// User management types following DMPW pattern

export interface User {
  id: string;
  user_code: string;
  emp_number: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  position: string;
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  avatar?: string;
  phone?: string;
  address?: string;
  sex?: boolean;
  birth_day?: string;
  effective_date?: string;
  expired_date?: string;
  is_master_card: boolean;
  
  // Organization info (current company context)
  company_id: string;
  department_id?: string;
  department_name?: string;
  access_group_id?: string;
  access_group_name?: string;
  
  // Account info
  account_id?: string;
  account_type?: number;
  
  // Multi-company info (if available)
  companies?: UserCompanyAssignment[];
  
  // Timestamps
  created_on: string;
  updated_on: string;
}

export interface UserCompanyAssignment {
  company_id: string;
  company_name: string;
  company_code: string;
  role: string;
  status: string;
  assigned_at?: string;
  updated_at?: string;
}

export interface UserAccount {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
  companies: UserCompanyAssignment[];
}

export interface AvailableCompany {
  id: string;
  name: string;
  code: string;
  status: string;
}

export interface CompanyAssignmentRequest {
  company_id: string;
  role: string;
}

export interface CompanyRoleUpdateRequest {
  role: string;
}

export interface UserFilters {
  search: string;
  status: 'all' | 'active' | 'inactive' | 'suspended' | 'pending';
  department_id: string;
  access_group_id: string;
  account_type: 'all' | 'with_account' | 'without_account';
  position: string;
  date_from: string;
  date_to: string;
  sort_by: string;
  sort_order: 'ASC' | 'DESC';
}

export interface UserPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Department {
  id: string;
  name: string;
  number: string;
  manager_id?: string;
  manager_name?: string;
}

export interface AccessGroup {
  id: string;
  name: string;
  is_default: boolean;
  type: number;
  permissions?: string[];
}

export interface FilterOptions {
  departments: Department[];
  access_groups: AccessGroup[];
  positions: string[];
}

export interface UserFormData {
  // Basic information
  first_name: string;
  last_name: string;
  email: string;
  user_code: string;
  emp_number?: string;
  position?: string;
  
  // Contact information
  phone?: string;
  address?: string;
  
  // Personal information
  sex?: boolean | null;
  birth_day?: string;
  
  // Employment information
  effective_date?: string;
  expired_date?: string;
  status: string;
  
  // Organization
  department_id?: string;
  access_group_id?: string;
  
  // Card settings
  is_master_card?: boolean;
}

export interface UserListResponse {
  users: User[];
  pagination: UserPagination;
  filters: UserFilters;
}

export interface BulkAction {
  type: 'delete' | 'update_department' | 'update_access_group' | 'approve' | 'suspend' | 'activate';
  user_ids: string[];
  params?: Record<string, any>;
}

export interface UserAccessHistory {
  id: string;
  user_id: string;
  device_name: string;
  door_name: string;
  access_time: string;
  access_type: 'entry' | 'exit';
  status: 'success' | 'denied';
  card_number?: string;
  reason?: string;
}

export interface UserCard {
  id: string;
  user_id: string;
  card_number: string;
  card_type: 'access' | 'visitor' | 'temp';
  is_active: boolean;
  issued_date: string;
  expired_date?: string;
  issuer_name: string;
}

export interface ImportResult {
  total_rows: number;
  success_count: number;
  error_count: number;
  errors: Array<{
    row: number;
    field?: string;
    message: string;
  }>;
  created_users: User[];
}

export interface ExportOptions {
  format: 'excel' | 'csv';
  include_deleted: boolean;
  date_range?: {
    from: string;
    to: string;
  };
  fields: string[];
}

// API Request/Response types
export interface UpdateUserRequest extends Partial<UserFormData> {
  id?: string;
}

export interface BulkUpdateRequest {
  user_ids: string[];
  updates: Partial<UserFormData>;
}

export interface UserSearchRequest {
  filters: Partial<UserFilters>;
  pagination: Partial<UserPagination>;
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}

// Form validation types
export interface UserFormErrors {
  first_name?: string;
  last_name?: string;
  email?: string;
  user_code?: string;
  password?: string;
  [key: string]: string | undefined;
}

// Permission types
export interface UserPermissions {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canBulkEdit: boolean;
  canImport: boolean;
  canExport: boolean;
  canManageCards: boolean;
  canViewAccessHistory: boolean;
}

// Modal state types
export interface UserModalState {
  isOpen: boolean;
  mode: 'create' | 'edit' | 'view';
  user?: User | null;
}

export interface BulkModalState {
  isOpen: boolean;
  action: BulkAction['type'] | null;
  selectedUsers: User[];
}

// Constants
export const USER_STATUSES = {
  active: 'Active',
  inactive: 'Inactive', 
  suspended: 'Suspended',
  pending: 'Pending',
} as const;

export const ACCOUNT_TYPES = {
  5: 'System Admin',
  4: 'Primary Manager', 
  2: 'Manager',
  1: 'Operator',
} as const;

export const USER_ROLES = {
  system_admin: 5,
  primary_manager: 4,
  manager: 2,
  operator: 1,
} as const;