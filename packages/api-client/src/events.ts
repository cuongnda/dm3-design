import { apiFetch } from './client';
import type { Paginated } from './types/api';

const BASE = '/api/v1/events';

export interface AccessEventDTO {
  id: string;
  company_id: string;
  time: string;
  person_id?: string;
  person_name?: string;
  credential_type?: string;
  direction?: string;
  decision: string;
  reason?: string;
  confidence?: number;
  door_id?: string;
  door_name?: string;
}

export interface ListEventsParams {
  page?: number;
  limit?: number;
  door_id?: string;
  person_id?: string;
  decision?: string;
  from?: string;
  to?: string;
}

export function listEvents(params?: ListEventsParams): Promise<Paginated<AccessEventDTO>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.door_id) qs.set('door_id', params.door_id);
  if (params?.person_id) qs.set('person_id', params.person_id);
  if (params?.decision) qs.set('decision', params.decision);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  const q = qs.toString();
  return apiFetch<Paginated<AccessEventDTO>>(`${BASE}${q ? '?' + q : ''}`);
}
