import { apiFetch } from './api';

// Helper type for paginated responses
interface PaginatedResponse<T> {
  data: T;
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

const SYSTEM_URL = '/api/v1/system';

// ─── User Accounts ──────────────────────────────────────────

export interface UserCompanyInfo {
  company_id: string;
  company_name: string;
  company_code: string;
  role: string;
  status: string;
}

export interface UserAccountDTO {
  id: string;
  email: string;
  name: string;
  roles: string[];
  role: string; // primary_manager, manager, operator, viewer, system_admin
  status: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
  companies: UserCompanyInfo[];
}

export interface CreateUserAccountRequest {
  email: string;
  name: string;
  role?: string;
  company_id?: string;
  send_email?: boolean;
}

export interface CreateUserAccountResponse {
  user: UserAccountDTO;
  password: string;
}

export interface UpdateUserAccountRequest {
  name?: string;
  role?: string;
  status?: string;
  company_id?: string;
}

export async function fetchUserAccounts(page = 1, limit = 20, params: Record<string, string> = {}): Promise<PaginatedResponse<UserAccountDTO>> {
  const query = new URLSearchParams({ page: page.toString(), limit: limit.toString(), ...params });
  return apiFetch<PaginatedResponse<UserAccountDTO>>(`${SYSTEM_URL}/accounts?${query}`);
}

export async function fetchUserAccount(id: string): Promise<UserAccountDTO> {
  return apiFetch<UserAccountDTO>(`${SYSTEM_URL}/accounts/${id}`);
}

export async function createUserAccount(data: CreateUserAccountRequest): Promise<CreateUserAccountResponse> {
  return apiFetch<CreateUserAccountResponse>(`${SYSTEM_URL}/accounts`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateUserAccount(id: string, data: UpdateUserAccountRequest): Promise<UserAccountDTO> {
  return apiFetch<UserAccountDTO>(`${SYSTEM_URL}/accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deleteUserAccount(id: string): Promise<void> {
  await apiFetch<void>(`${SYSTEM_URL}/accounts/${id}`, { method: 'DELETE' });
}

export async function resetUserPassword(id: string): Promise<{ password: string; message: string }> {
  return apiFetch<{ password: string; message: string }>(`${SYSTEM_URL}/accounts/${id}/reset-password`, { method: 'POST' });
}

export async function changeUserPassword(id: string, newPassword: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`${SYSTEM_URL}/accounts/${id}/change-password`, {
    method: 'PUT',
    body: JSON.stringify({ password: newPassword }),
  });
}