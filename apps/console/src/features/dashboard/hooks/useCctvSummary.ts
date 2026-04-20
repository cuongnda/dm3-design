import { useQuery } from '@tanstack/react-query';
import { listCameras } from '@dm3/api-client';
import type { CameraDTO } from '@dm3/api-client';
import { usePlugin } from './usePlugin';

export interface CctvSummary {
  total: number;
  online: number;
  offline: number;
  offlineCameras: CameraDTO[];
  cameras: CameraDTO[];
}

function summarize(cameras: CameraDTO[]): CctvSummary {
  const online = cameras.filter((c) => c.status === 'online').length;
  const offlineCameras = cameras.filter((c) => c.status !== 'online');
  return {
    total: cameras.length,
    online,
    offline: offlineCameras.length,
    offlineCameras,
    cameras,
  };
}

export function useCctvSummary() {
  const enabled = usePlugin('cctv');
  return useQuery<CctvSummary>({
    queryKey: ['dashboard', 'cctv-summary'],
    queryFn: async () => {
      const res = await listCameras({ limit: 100, page: 1 });
      return summarize(res.items ?? []);
    },
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
