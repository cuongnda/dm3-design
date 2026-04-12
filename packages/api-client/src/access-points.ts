import { apiFetch } from './client';
import type { Paginated } from './types/api';

// Minimal AccessPoint DTO — mirrors backend models.AccessPoint (common fields only).
// Extend as needed; unused fields are omitted for brevity.
export interface AccessPointDTO {
  id: string;
  tenant_id: string;
  zone_id?: string;
  access_time_id?: string;
  name: string;
  description?: string;
  access_device_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ListAccessPointsParams {
  page?: number;
  limit?: number;
  zone_id?: string;
  search?: string;
}

export function listAccessPoints(
  params?: ListAccessPointsParams,
): Promise<Paginated<AccessPointDTO>> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.zone_id) qs.set('zone_id', params.zone_id);
  if (params?.search) qs.set('search', params.search);
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiFetch(`/api/v1/access-points${suffix}`);
}
