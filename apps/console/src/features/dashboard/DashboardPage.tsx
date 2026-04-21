import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCcw, ShieldCheck } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useRealtimeStore, useActiveAlarms } from '@dm3/api-client';
import { HeroStrip } from './sections/HeroStrip';
import { PluginInsightGrid } from './sections/PluginInsightGrid';
import { LiveEventsPanel } from './sections/LiveEventsPanel';
import { ActiveAlertsPanel } from './sections/ActiveAlertsPanel';
import { DomainHealthGrid } from './sections/DomainHealthGrid';
import { AuditStrip } from './sections/AuditStrip';

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function DashboardPage(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const queryClient = useQueryClient();
  const isConnected = useRealtimeStore((s) => s.connected);
  const isConnecting = useRealtimeStore((s) => s.connecting);
  const activeAlarms = useActiveAlarms();
  const hasAlarms = activeAlarms.length > 0;

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setLastRefresh((prev) => prev), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['stats'] });
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
      setLastRefresh(new Date());
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('title')}>
        <div className="flex items-center gap-2">
          <span
            data-testid="dashboard-updated-at"
            className="text-[11px] text-muted-foreground tabular-nums"
          >
            {t('header.lastUpdated', 'Updated')} {formatTime(lastRefresh)}
          </span>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="dashboard-button-refresh"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px] hover:bg-muted/20 disabled:opacity-50"
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />
            {t('header.refresh', 'Refresh')}
          </button>
          <div
            data-testid="dashboard-connection-status"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]"
          >
            <span
              className={cn(
                'w-2 h-2 rounded-full',
                isConnected
                  ? 'bg-success animate-pulse'
                  : isConnecting
                  ? 'bg-warning animate-pulse'
                  : 'bg-error',
              )}
            />
            {isConnected
              ? t('events.live')
              : isConnecting
              ? t('status.connecting')
              : t('status.offline')}
          </div>
        </div>
      </PageHeader>

      <HeroStrip />

      {hasAlarms ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4 mb-6">
          <LiveEventsPanel />
          <ActiveAlertsPanel />
        </div>
      ) : (
        <>
          <div
            data-testid="dashboard-alerts-pill"
            className="mb-4 flex items-center gap-2 px-4 py-2 bg-success/5 border border-success/30 rounded-lg text-[12px]"
          >
            <ShieldCheck size={14} className="text-success shrink-0" />
            <span className="font-medium text-success">
              {t('alerts.emptyTitle', 'All clear')}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {t('alerts.emptyHint', 'No active alarms right now.')}
            </span>
          </div>
          <div className="mb-6">
            <LiveEventsPanel />
          </div>
        </>
      )}

      <PluginInsightGrid />

      <DomainHealthGrid />

      <div className="mt-6">
        <AuditStrip />
      </div>
    </div>
  );
}
