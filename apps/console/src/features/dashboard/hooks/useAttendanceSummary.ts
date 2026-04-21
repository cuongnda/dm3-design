import { useQuery } from '@tanstack/react-query';
import { getAttendanceDailySummary } from '@dm3/api-client';
import type { AttendanceDailySummaryDTO } from '@dm3/api-client';
import { usePlugin } from './usePlugin';

export function useAttendanceSummary() {
  const enabled = usePlugin('attendance');
  return useQuery<AttendanceDailySummaryDTO>({
    queryKey: ['dashboard', 'attendance-daily'],
    queryFn: () => getAttendanceDailySummary(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}
