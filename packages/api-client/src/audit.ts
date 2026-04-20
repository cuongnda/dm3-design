import { apiFetch } from "./client";
import type { Paginated } from "./types/api";

const BASE = "/api/v1/audit";

export interface AuditLogDTO {
  id: string;
  time: string;
  tenant_id?: string;
  actor_id?: string;
  actor_email?: string;
  actor_ip?: string;
  user_agent?: string;
  service: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  entity_name?: string;
  status: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ListAuditLogsParams {
  page?: number;
  limit?: number;
  service?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
  status?: string;
  from?: string;
  to?: string;
}

function withQuery<T extends object>(path: string, params?: T) {
  const qs = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") qs.set(key, String(value));
  });
  const query = qs.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

/** Tenant-scoped audit log listing (for non-admin tenant users). */
export function listTenantAuditLogs(
  params?: ListAuditLogsParams,
): Promise<Paginated<AuditLogDTO>> {
  return apiFetch(withQuery(`${BASE}/tenant/logs`, params));
}

/** System-wide audit log listing (admin only). */
export function listAuditLogs(
  params?: ListAuditLogsParams,
): Promise<Paginated<AuditLogDTO>> {
  return apiFetch(withQuery(`${BASE}/logs`, params));
}
