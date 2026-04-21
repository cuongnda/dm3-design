import { useQuery } from '@tanstack/react-query';
import { getTodaySummary } from '@dm3/api-client';
import type { VisitSummaryDTO } from '@dm3/api-client';
import { usePlugin } from './usePlugin';

export function useVisitorSummary() {
  const enabled = usePlugin('visitor');
  return useQuery<VisitSummaryDTO>({
    queryKey: ['dashboard', 'visitor-today'],
    queryFn: getTodaySummary,
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
