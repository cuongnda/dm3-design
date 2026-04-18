// Department Management Types

export interface Department {
  id: string;
  company_id: string;
  parent_id?: string;
  parent_name?: string;
  name: string;
  number: string;
  description?: string;
  department_manager_id?: string;
  manager_name?: string;
  access_group_id?: string;
  user_count?: number;
  status: string;
  created_by?: string;
  created_on: string;
  created_at: string;
  updated_by?: string;
  updated_on: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface DepartmentFormData {
  name: string;
  number: string;
  description?: string;
  parent_id?: string;
  department_manager_id?: string;
  access_group_id?: string;
}

export interface DepartmentFilters {
  search: string;
  status: string;
  manager: string;
  parent_id?: string;
}

export interface DepartmentUser {
  id: string;
  user_code: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  position?: string;
  department_id?: string;
  department_name?: string;
  status: string;
  assigned_at?: string;
  assigned_by?: string;
}

export interface DepartmentManager {
  id: string;
  username: string;
  name?: string;
  type: number;
}

export interface DepartmentImportData {
  name: string;
  number: string;
  description?: string;
  parent_department_number?: string;
  manager_username?: string;
}

export interface DepartmentStats {
  total_departments: number;
  active_departments: number;
  departments_with_managers: number;
  total_users: number;
  users_assigned: number;
}