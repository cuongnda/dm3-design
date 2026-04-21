import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Cpu,
  Lock,
  TrendingUp,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStats, useDevices } from '@/lib/hooks';
import {
  useActiveAlarms,
  useDeviceStatus,
  useRealtimeStore,
} from '@dm3/api-client';
import type { RealtimeDeviceStatus } from '@dm3/api-client';

function HourlyBars({
  hourly,
  currentHour,
}: {
  hourly: Array<{ hour: number; granted: number; denied: number }>;
  currentHour: number;
}): React.ReactElement {
  const totals = hourly.map((b) => b.granted + b.denied);
  const hasAnyActivity = totals.some((v) => v > 0);
  const max = Math.max(1, ...totals);

  if (!hasAnyActivity) {
    return (
      <div className="flex items-center justify-center h-16 w-full border border-dashed border-border/50 rounded-md">
        <span className="text-[11px] text-muted-foreground">
          No activity yet today
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-[3px] h-16 w-full">
      {hourly.map((b) => {
        const total = b.granted + b.denied;
        const pct = (total / max) * 100;
        const grantedPct = total > 0 ? (b.granted / total) * 100 : 0;
        const isNow = b.hour === currentHour;
        const isPast = b.hour < currentHour;
        return (
          <div
            key={b.hour}
            className="flex-1 flex flex-col justify-end group relative"
            title={`${String(b.hour).padStart(2, '0')}:00 — ${b.granted} granted, ${b.denied} denied`}
          >
            <div
              className={cn(
                'w-full rounded-sm overflow-hidden flex flex-col-reverse transition-opacity',
                isNow && 'ring-1 ring-secure ring-offset-1 ring-offset-card',
                !isPast && !isNow && 'opacity-30',
              )}
              style={{ height: `${Math.max(pct, total > 0 ? 8 : 2)}%` }}
            >
              {total > 0 ? (
                <>
                  <div
                    className="bg-success"
                    style={{ height: `${grantedPct}%` }}
                  />
                  <div
                    className="bg-error"
                    style={{ height: `${100 - grantedPct}%` }}
                  />
                </>
              ) : (
                <div className="bg-muted/20 h-full" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: 'default' | 'warning' | 'error' | 'success';
}): React.ReactElement {
  const toneClass = {
    default: 'text-foreground',
    warning: 'text-warning',
    error: 'text-error',
    success: 'text-success',
  }[tone];
  return (
    <div className="flex-1 min-w-0 px-4 py-3 border-l border-border/60 first:border-l-0">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className={cn('text-[22px] font-semibold tabular-nums mt-1', toneClass)}>
        {value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
        {sub}
      </div>
    </div>
  );
}

export function HeroStrip(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const { data: stats } = useStats();
  const { data: devicesData } = useDevices();
  const isConnected = useRealtimeStore((s) => s.connected);
  const activeAlarms = useActiveAlarms();
  const deviceStatuses = useDeviceStatus() as RealtimeDeviceStatus[];

  const devicesOnline =
    deviceStatuses.filter((d) => d.online).length ||
    (devicesData?.filter((d) => d.status === 'online').length ?? 0);
  const devicesTotal = deviceStatuses.length || (devicesData?.length ?? 0);

  const onSite = stats?.on_site_count ?? 0;
  const entriesLastHour = stats?.entries_last_hour ?? 0;
  const deniesLastHour = stats?.denies_last_hour ?? 0;
  const granted = stats?.granted_today ?? 0;
  const denied = stats?.denied_today ?? 0;
  const total = granted + denied;
  const grantedPct = total > 0 ? Math.round((granted / total) * 100) : 100;
  const peakLabel = stats?.peak_hour_label ?? '—';
  const peakCount = stats?.peak_hour_count ?? 0;
  const currentHour = new Date().getHours();
  const hourly = stats?.hourly ?? [];

  const criticalAlerts = activeAlarms.filter((a) => a.severity === 'critical').length;
  const doorsOnline = stats?.doors_online ?? 0;
  const doorsTotal = stats?.doors_total ?? 0;
  const doorsOffline = stats?.doors_offline ?? 0;

  return (
    <section
      data-testid="dashboard-section-hero"
      className="mb-6 bg-gradient-to-br from-card via-card to-muted/5 border border-border rounded-xl overflow-hidden"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-0">
        <div className="p-6 lg:border-r border-border/60 relative">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide mb-1">
            <Users size={12} className="text-secure" />
            {t('hero.onSite', 'People on-site')}
            <span
              className={cn(
                'ml-auto w-1.5 h-1.5 rounded-full',
                isConnected ? 'bg-success animate-pulse' : 'bg-muted',
              )}
            />
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <div className="text-[64px] font-bold tabular-nums leading-none text-foreground">
              {onSite}
            </div>
            <div className="text-[13px] text-muted-foreground">
              {t('hero.rightNow', 'right now')}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-md',
                entriesLastHour > 0
                  ? 'bg-success/10 text-success'
                  : 'bg-muted/20 text-muted-foreground',
              )}
            >
              <ArrowUpRight size={12} />
              {entriesLastHour} {t('hero.inLastHour', 'in last hour')}
            </span>
            {deniesLastHour > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[12px] bg-error/10 text-error px-2.5 py-1 rounded-md">
                <ArrowDownRight size={12} />
                {deniesLastHour} {t('hero.deniedLastHour', 'denied last hour')}
              </span>
            )}
            {criticalAlerts > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[12px] bg-error/10 text-error px-2.5 py-1 rounded-md">
                <AlertTriangle size={12} />
                {criticalAlerts} {t('hero.critical', 'critical')}
              </span>
            )}
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground uppercase tracking-wide mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={12} className="text-secure" />
              {t('hero.todayActivity', "Today's activity")}
            </div>
            <div className="normal-case tracking-normal text-foreground">
              <span className="text-success font-semibold">{granted}</span>
              <span className="text-muted-foreground"> / </span>
              <span className="text-error font-semibold">{denied}</span>
              <span className="text-muted-foreground ml-2">
                {grantedPct}% {t('hero.grantRate', 'grant rate')}
              </span>
            </div>
          </div>
          <HourlyBars hourly={hourly} currentHour={currentHour} />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-2 tabular-nums">
            <span>00:00</span>
            <span>
              {peakCount > 0
                ? `${t('hero.peak', 'Peak')} ${peakLabel} · ${peakCount}`
                : t('hero.noActivity', 'No activity yet')}
            </span>
            <span>23:59</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row border-t border-border/60">
        <MiniStat
          icon={<Lock size={12} />}
          label={t('stats.doors', 'Doors')}
          value={`${doorsOnline}/${doorsTotal}`}
          sub={
            doorsOffline > 0
              ? `${doorsOffline} ${t('status.offline', 'offline')}`
              : t('hero.allHealthy', 'all healthy')
          }
          tone={doorsOffline > 0 ? 'warning' : 'success'}
        />
        <MiniStat
          icon={<Cpu size={12} />}
          label={t('stats.devicesOnline', 'Devices')}
          value={`${devicesOnline}/${devicesTotal}`}
          sub={
            devicesTotal - devicesOnline > 0
              ? `${devicesTotal - devicesOnline} ${t('status.offline', 'offline')}`
              : t('hero.allConnected', 'all connected')
          }
          tone={devicesTotal > 0 && devicesOnline === 0 ? 'error' : devicesOnline < devicesTotal ? 'warning' : 'success'}
        />
        <MiniStat
          icon={<AlertTriangle size={12} />}
          label={t('stats.activeAlerts', 'Alerts')}
          value={String(activeAlarms.length)}
          sub={
            criticalAlerts > 0
              ? `${criticalAlerts} ${t('hero.critical', 'critical')}`
              : t('hero.allClear', 'all clear')
          }
          tone={criticalAlerts > 0 ? 'error' : activeAlarms.length > 0 ? 'warning' : 'success'}
        />
      </div>
    </section>
  );
}
