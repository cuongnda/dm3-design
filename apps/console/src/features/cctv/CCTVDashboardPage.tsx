import { useQuery } from '@tanstack/react-query';
import { PageHeader, StatCard } from '@dm3/ui';
import { useTranslation } from 'react-i18next';
import { listCameras, listClips } from '@dm3/api-client';
import { RecentClipsList } from './components/RecentClipsList';

export function CCTVDashboardPage() {
  const { t } = useTranslation('common');

  const { data: camerasData, isLoading: camerasLoading } = useQuery({
    queryKey: ['cctv-cameras-all'],
    queryFn: () => listCameras({ limit: 200 }),
    refetchInterval: 30_000,
  });

  const { data: clipsData, isLoading: clipsLoading } = useQuery({
    queryKey: ['cctv-clips-recent'],
    queryFn: () => listClips({ limit: 10 }),
    refetchInterval: 30_000,
  });

  const cameras = camerasData?.data ?? [];
  const onlineCount = cameras.filter((c) => c.status === 'online').length;
  const offlineCount = cameras.filter((c) => c.status !== 'online').length;
  const clips = clipsData?.data ?? [];
  const clipsTotal = clipsData?.total ?? 0;

  const isLoading = camerasLoading || clipsLoading;

  return (
    <div>
      <PageHeader
        title={t('cctv.dashboard.title')}
        description={t('cctv.dashboard.description')}
      />

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">{t('cctv.common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard
              label={t('cctv.dashboard.totalCameras')}
              value={String(cameras.length)}
              sub={t('cctv.dashboard.registered')}
              domain="secure"
              data-testid="cctv-card-total-cameras"
            />
            <StatCard
              label={t('cctv.dashboard.online')}
              value={String(onlineCount)}
              sub={t('cctv.dashboard.active')}
              domain="secure"
              data-testid="cctv-card-online"
            />
            <StatCard
              label={t('cctv.dashboard.offline')}
              value={String(offlineCount)}
              sub={t('cctv.dashboard.notReachable')}
              domain="error"
              data-testid="cctv-card-offline"
            />
            <StatCard
              label={t('cctv.dashboard.recentClips')}
              value={String(clipsTotal)}
              sub={t('cctv.dashboard.clipsStored')}
              domain="secure"
              data-testid="cctv-card-clips"
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <h3 className="text-[13px] font-semibold mb-3">{t('cctv.dashboard.recentClipsTitle')}</h3>
            <RecentClipsList clips={clips} />
          </div>
        </>
      )}
    </div>
  );
}
