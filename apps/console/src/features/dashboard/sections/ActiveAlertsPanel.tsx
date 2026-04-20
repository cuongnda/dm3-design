import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveAlarms } from '@dm3/api-client';

const severityDot: Record<string, string> = {
  critical: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-secure',
};

const staticAlerts = [
  { id: '1', title: 'Door 5 forced open', meta: 'Building A, Floor 3 · 2m ago', severity: 'critical' },
  { id: '2', title: 'Intrusion alarm — Zone B', meta: 'Perimeter sensor · 5m ago', severity: 'critical' },
  { id: '3', title: 'NVR-02 storage at 90%', meta: 'Camera storage · 12m ago', severity: 'warning' },
  { id: '4', title: 'Door 12 reader offline', meta: 'Building B, Floor 1 · 28m ago', severity: 'info' },
  { id: '5', title: 'Scheduled maintenance due', meta: 'Turnstile 3 · 1h ago', severity: 'info' },
];

export function ActiveAlertsPanel(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const activeAlarms = useActiveAlarms();

  const realtimeAlerts = activeAlarms.map((alarm) => ({
    id: alarm.id,
    title: `${alarm.alarmType}: ${alarm.doorId || alarm.zone || 'Unknown location'}`,
    meta: `Device ${alarm.deviceId} · ${Math.floor((Date.now() - alarm.time.getTime()) / 60000)}m ago`,
    severity: alarm.severity,
  }));

  const alerts = realtimeAlerts.length > 0 ? realtimeAlerts : staticAlerts;

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
        <span className="text-[12px] text-secure cursor-pointer hover:underline">
          {t('alerts.viewAll')}
        </span>
      </div>
      <div className="px-4 py-3 space-y-0">
        {alerts.map((a) => (
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
        ))}
      </div>
    </div>
  );
}
