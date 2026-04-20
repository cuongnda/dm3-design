import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveAlarms } from '@dm3/api-client';

const severityDot: Record<string, string> = {
  critical: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-secure',
};

export function ActiveAlertsPanel(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const activeAlarms = useActiveAlarms();

  const alerts = activeAlarms.map((alarm) => ({
    id: alarm.id,
    title: `${alarm.alarmType}: ${alarm.doorId || alarm.zone || 'Unknown location'}`,
    meta: `Device ${alarm.deviceId} · ${Math.floor((Date.now() - alarm.time.getTime()) / 60000)}m ago`,
    severity: alarm.severity,
  }));

  return (
    <div
      data-testid="dashboard-section-active-alerts"
      className="bg-card border border-border rounded-lg overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="text-[13px] font-semibold flex items-center gap-2">
          <AlertTriangle size={14} className="text-warning" />
          {t('alerts.title')}
        </div>
        <button
          type="button"
          data-testid="dashboard-section-active-alerts-cta"
          onClick={() => navigate('/alerts')}
          className="text-[12px] text-secure hover:underline"
        >
          {t('alerts.viewAll')}
        </button>
      </div>
      <div className="px-4 py-3 space-y-0">
        {alerts.length === 0 ? (
          <div
            data-testid="dashboard-section-active-alerts-empty"
            className="flex flex-col items-center justify-center py-10 text-center"
          >
            <Check size={24} className="text-success mb-2" />
            <div className="text-[13px] font-medium text-foreground">
              {t('alerts.emptyTitle', 'All clear')}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {t('alerts.emptyHint', 'No active alarms right now.')}
            </div>
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="flex gap-2.5 py-2.5 border-b border-border/50 last:border-0"
            >
              <span
                className={cn(
                  'w-2 h-2 rounded-full mt-1.5 shrink-0',
                  severityDot[a.severity],
                )}
              />
              <div>
                <div className="text-[13px] font-medium text-foreground">{a.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{a.meta}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
