import { useQuery } from '@tanstack/react-query';
import { listTenantAuditLogs } from '@dm3/api-client';
import type { AuditLogDTO, Paginated } from '@dm3/api-client';

export function useAuditRecent(limit = 5) {
  return useQuery<Paginated<AuditLogDTO>>({
    queryKey: ['dashboard', 'audit-recent', limit],
    queryFn: () => listTenantAuditLogs({ page: 1, limit }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}
