import { apiFetch } from './client';

const AUTH = '/api/v1/auth';

export interface LoginCompany {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
  role: string;
}

export interface LoginUser {
  id: string;
  name: string;
  email: string;
  role?: string;
  company_id?: string;
}

export interface LoginResponse {
  step: 'select_company' | 'complete';
  temporary_token?: string;
  access_token?: string;
  refresh_token?: string;
  user?: LoginUser;
  companies?: LoginCompany[];
}

export interface MeResponse {
  id: string;
  tenant_id: string;
  company_id?: string | null;
  email: string;
  name?: string | null;
  roles: string[];
  role?: string | null;
  status: string;
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(`${AUTH}/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function loginStep2(temporaryToken: string, companyId: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>(`${AUTH}/login-step2`, {
    method: 'POST',
    body: JSON.stringify({ temporary_token: temporaryToken, company_id: companyId }),
  });
}

export function refreshAuth(refreshToken: string): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  return apiFetch(`${AUTH}/refresh`, {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function logout(): Promise<void> {
  return apiFetch<void>(`${AUTH}/logout`, { method: 'POST' });
}

export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>(`${AUTH}/me`);
}
