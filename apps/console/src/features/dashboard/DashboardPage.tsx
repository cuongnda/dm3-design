import { useTranslation } from 'react-i18next';
import { Building2, Calendar } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useRealtimeStore } from '@dm3/api-client';
import { CoreKpiStrip } from './sections/CoreKpiStrip';
import { PluginKpiChips } from './sections/PluginKpiChips';
import { PluginInsightGrid } from './sections/PluginInsightGrid';
import { LiveEventsPanel } from './sections/LiveEventsPanel';
import { ActiveAlertsPanel } from './sections/ActiveAlertsPanel';
import { DomainHealthGrid } from './sections/DomainHealthGrid';

export function DashboardPage(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const isConnected = useRealtimeStore((s) => s.connected);
  const isConnecting = useRealtimeStore((s) => s.connecting);

  return (
    <div>
      <PageHeader title={t('title')}>
        <div className="flex gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]"
          >
            <Building2 size={14} /> Landmark 81 ▾
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]"
          >
            <Calendar size={14} /> Today ▾
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]">
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

      <CoreKpiStrip />
      <PluginKpiChips />

      <div className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4 mb-6">
        <LiveEventsPanel />
        <ActiveAlertsPanel />
      </div>

      <PluginInsightGrid />

      <DomainHealthGrid />
    </div>
  );
}
