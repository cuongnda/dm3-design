import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CircleParking } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParkingDashboard } from '../hooks/useParkingDashboard';

export function ParkingDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data, isLoading, isError } = useParkingDashboard();

  const occupancy = data ? Math.round(data.occupancy_percent) : 0;
  const topZones = (data?.zone_occupancy ?? [])
    .slice()
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);

  return (
    <div
      data-testid="dashboard-card-parking"
      className="bg-card border border-border rounded-lg p-4 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CircleParking size={16} className="text-operate" />
          <span className="text-[13px] font-semibold text-foreground">
            {t('insight.parkingOverview', 'Parking Overview')}
          </span>
        </div>
        <button
          type="button"
          data-testid="dashboard-card-parking-cta"
          onClick={() => navigate('/parking')}
          className="text-[12px] text-secure hover:underline"
        >
          {t('insight.viewParking', 'View Parking →')}
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded w-1/3" />
          <div className="h-3 bg-muted/30 rounded w-2/3" />
          <div className="h-3 bg-muted/30 rounded w-1/2" />
        </div>
      ) : isError || !data ? (
        <div className="text-[12px] text-muted-foreground">
          {t('plugin.noData', 'No data available')}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="text-[28px] font-semibold tracking-tight text-operate">
              {occupancy}%
            </span>
            <span className="text-[12px] text-muted-foreground">
              {data.occupied_spaces} / {data.total_spaces}{' '}
              {t('insight.parkingSpots', 'spots')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground mb-3">
            <div>
              <span className="text-foreground font-medium">{data.entered_today}</span>{' '}
              {t('insight.parkingEntered', 'entered today')}
            </div>
            <div>
              <span className="text-foreground font-medium">{data.exited_today}</span>{' '}
              {t('insight.parkingExited', 'exited today')}
            </div>
          </div>
          {topZones.length > 0 && (
            <div className="space-y-1.5 mt-auto">
              {topZones.map((z) => (
                <div
                  key={z.zone_id}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-foreground truncate max-w-[60%]">{z.zone_name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 bg-muted/30 rounded overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded',
                          z.percent >= 90
                            ? 'bg-error'
                            : z.percent >= 75
                            ? 'bg-warning'
                            : 'bg-operate',
                        )}
                        style={{ width: `${Math.min(100, Math.round(z.percent))}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground tabular-nums w-9 text-right">
                      {Math.round(z.percent)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
