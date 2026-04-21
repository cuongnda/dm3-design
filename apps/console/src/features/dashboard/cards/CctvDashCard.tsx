import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Camera, VideoOff } from 'lucide-react';
import { useCctvSummary } from '../hooks/useCctvSummary';

export function CctvDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data, isLoading, isError } = useCctvSummary();

  const total = data?.total ?? 0;
  const online = data?.online ?? 0;
  const offlineCameras = (data?.offlineCameras ?? []).slice(0, 3);

  return (
    <div
      data-testid="dashboard-card-cctv"
      className="bg-card border border-border rounded-lg p-4 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Camera size={16} className="text-secure" />
          <span className="text-[13px] font-semibold text-foreground">
            {t('insight.cctvStatus', 'CCTV Status')}
          </span>
        </div>
        <button
          type="button"
          data-testid="dashboard-card-cctv-cta"
          onClick={() => navigate('/cctv')}
          className="text-[12px] text-secure hover:underline"
        >
          {t('insight.viewCctv', 'View CCTV →')}
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded w-1/3" />
          <div className="h-3 bg-muted/30 rounded w-2/3" />
        </div>
      ) : isError || !data ? (
        <div className="text-[12px] text-muted-foreground">
          {t('plugin.noData', 'No data available')}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-[28px] font-semibold tracking-tight text-secure">
              {online}
              <span className="text-muted-foreground">/{total}</span>
            </span>
            <span className="text-[12px] text-muted-foreground">
              {t('insight.cctvOnline', 'cameras online')}
            </span>
          </div>
          {offlineCameras.length > 0 ? (
            <div className="mt-auto space-y-1.5">
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <VideoOff size={11} className="text-error" />
                {t('insight.cctvOffline', 'Offline cameras')}
              </div>
              {offlineCameras.map((c) => (
                <div
                  key={c.id}
                  className="text-[11px] text-foreground flex items-center justify-between"
                >
                  <span className="truncate max-w-[70%]">{c.name}</span>
                  <span className="text-error">{c.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-auto text-[11px] text-success">
              {t('insight.cctvAllOnline', 'All cameras online')}
            </div>
          )}
        </>
      )}
    </div>
  );
}
