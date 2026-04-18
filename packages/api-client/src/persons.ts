import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/persons';

export interface PersonDTO {
  id: string;
  company_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department?: string;
  role?: string;
  employee_id?: string;
  status: string;
  photo_url?: string;
  group_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface CreatePersonRequest {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  department?: string;
  role?: string;
  employee_id?: string;
}

export interface ListPersonsParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  status?: string;
  role?: string;
}

export function listPersons(params?: ListPersonsParams): Promise<Paginated<PersonDTO>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.department) qs.set('department', params.department);
  if (params?.status) qs.set('status', params.status);
  if (params?.role) qs.set('role', params.role);
  const q = qs.toString();
  return apiFetch<Paginated<PersonDTO>>(`${BASE}${q ? '?' + q : ''}`);
}

export function getPerson(id: string): Promise<PersonDTO> {
  return apiFetch<PersonDTO>(`${BASE}/${id}`);
}

export function createPerson(data: CreatePersonRequest): Promise<PersonDTO> {
  return apiFetch<PersonDTO>(BASE, { method: 'POST', body: JSON.stringify(data) });
}

export function updatePerson(id: string, data: Partial<CreatePersonRequest>): Promise<PersonDTO> {
  return apiFetch<PersonDTO>(`${BASE}/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deletePerson(id: string): Promise<void> {
  return apiFetch<void>(`${BASE}/${id}`, { method: 'DELETE' });
}
