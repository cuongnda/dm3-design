import { useQuery } from '@tanstack/react-query';
import { getParkingDashboard } from '@dm3/api-client';
import type { ParkingDashboardDTO } from '@dm3/api-client';
import { usePlugin } from './usePlugin';

export function useParkingDashboard() {
  const enabled = usePlugin('parking');
  return useQuery<ParkingDashboardDTO>({
    queryKey: ['dashboard', 'parking'],
    queryFn: getParkingDashboard,
    enabled,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}
