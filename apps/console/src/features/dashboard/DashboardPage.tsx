import { useTranslation } from 'react-i18next';
import { AlertTriangle, Building2, Calendar, Check, CircleParking, Cpu, Lock, SquareActivity, UserCog } from 'lucide-react';
import { PageHeader } from '@dm3/ui';
import { StatCard } from '@dm3/ui';
import { EventFeed } from '@dm3/ui';
import { cn } from '@/lib/utils';
import { useStats, useDevices } from '@/lib/hooks';
import {
  useRealtimeStore,
  useRecentEvents,
  useActiveAlarms,
  useDeviceStatus,
} from '@dm3/api-client';
import type { AccessEvent, DomainHealth, RealtimeDeviceStatus } from '@dm3/api-client';

// Transform realtime event to UI format
function realtimeEventToAccessEvent(event: any): AccessEvent {
  const time = `${String(event.time.getHours()).padStart(2, '0')}:${String(event.time.getMinutes()).padStart(2, '0')}`;
  return {
    id: event.id,
    time,
    personName: event.personName || 'Unknown',
    point: event.doorName || event.doorId || '—',
    result: event.decision === 'granted' ? 'granted' : 'denied',
    credentialType: event.credentialType,
  };
}

// Legacy API event transformer
function eventDtoToAccessEvent(e: any): AccessEvent {
  const t = new Date(e.time);
  const time = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  return {
    id: e.id,
    time,
    personName: e.person_name || 'Unknown',
    point: e.door_name || e.credential_type || '—',
    result: e.decision === 'granted' ? 'granted' : 'denied',
    credentialType: e.credential_type,
  };
}

const severityDot: Record<string, string> = {
  critical: 'bg-error',
  warning: 'bg-warning',
  info: 'bg-secure',
};

const healthStatusClass: Record<string, string> = {
  ok: 'text-success',
  warning: 'text-warning',
  critical: 'text-error',
};

export function DashboardPage() {
  const { t } = useTranslation('dashboard');

  // API data
  const { data: statsData } = useStats();
  const { data: devicesData } = useDevices();

  // Real-time state — connection managed by <RealtimeProvider> in App.tsx
  const isConnected = useRealtimeStore((s) => s.connected);
  const isConnecting = useRealtimeStore((s) => s.connecting);
  const realtimeEvents = useRecentEvents(10);
  const activeAlarms = useActiveAlarms();
  const deviceStatuses = useDeviceStatus() as RealtimeDeviceStatus[];

  // Build stats from real data + real-time status
  const devicesOnline = deviceStatuses.filter(d => d.online).length ||
                        (devicesData?.filter((d) => d.status === 'online').length ?? 0);
  const devicesTotal = deviceStatuses.length || (devicesData?.length ?? 0);

  const stats = [
    {
      label: t('stats.eventsToday'),
      value: String(statsData?.events_today ?? 0),
      sub: `${statsData?.granted_today ?? 0} granted, ${statsData?.denied_today ?? 0} denied`,
      trend: {
        direction: 'up' as const,
        text: isConnected ? t('status.live') : (isConnecting ? t('status.connecting') : t('status.offline'))
      },
      icon: <SquareActivity size={14} />,
      domain: 'default' as const,
    },
    {
      label: t('stats.doors'),
      value: `${statsData?.doors_online ?? 0}/${statsData?.doors_total ?? 0}`,
      sub: t('stats.accessPoints'),
      trend: {
        direction: (statsData?.doors_offline ?? 0) > 0 ? 'down' as const : 'up' as const,
        text: `${statsData?.doors_offline ?? 0} ${t('status.offline')}`
      },
      icon: <Lock size={14} />,
      domain: 'secure' as const,
    },
    {
      label: t('stats.devicesOnline'),
      value: `${devicesOnline}/${devicesTotal}`,
      sub: t('stats.connectedDevices'),
      trend: {
        direction: devicesOnline === devicesTotal ? 'up' as const : 'down' as const,
        text: `${devicesTotal - devicesOnline} ${t('status.offline')}`
      },
      icon: <Cpu size={14} />,
      domain: 'default' as const,
    },
    {
      label: t('stats.activeAlerts'),
      value: String(activeAlarms.length),
      sub: t('stats.needAttention'),
      trend: {
        direction: activeAlarms.filter(a => a.severity === 'critical').length > 0 ? 'down' as const : 'up' as const,
        text: `${activeAlarms.filter(a => a.severity === 'critical').length} critical`
      },
      icon: <AlertTriangle size={14} />,
      domain: 'error' as const,
    },
    {
      label: t('stats.parking'),
      value: '78%',
      sub: '312 / 400 spots',
      trend: { direction: 'up' as const, text: '5% from last week' },
      icon: <CircleParking size={14} />,
      domain: 'operate' as const,
    },
  ];

  const domainHealthData: { domain: string; colorCls: string; Icon: typeof Lock; items: DomainHealth[]; viewLink: string }[] = [
    {
      domain: t('domain.secure'), colorCls: 'text-secure', Icon: Lock,
      viewLink: t('health.viewSecurity'),
      items: [
        { module: t('modules.accessControl'), status: 'ok', detail: 'Online' },
        { module: t('modules.cctv'), status: 'warning', detail: '1 offline' },
        { module: t('modules.intrusion'), status: 'ok', detail: 'Armed' },
        { module: t('modules.intercom'), status: 'ok', detail: 'Online' },
        { module: t('modules.aiDetection'), status: 'ok', detail: 'Active' },
      ],
    },
    {
      domain: t('domain.manage'), colorCls: 'text-manage', Icon: UserCog,
      viewLink: t('health.viewPeople'),
      items: [
        { module: t('modules.visitors'), status: 'ok', detail: '3 waiting' },
        { module: t('modules.attendance'), status: 'ok', detail: 'Online' },
        { module: t('modules.contractors'), status: 'ok', detail: '34 on-site' },
        { module: t('modules.deliveries'), status: 'warning', detail: '2 uncollected' },
      ],
    },
    {
      domain: t('domain.operate'), colorCls: 'text-operate', Icon: Building2,
      viewLink: t('health.viewFacility'),
      items: [
        { module: t('modules.roomBooking'), status: 'ok', detail: '3/12 in use' },
        { module: t('modules.parking'), status: 'ok', detail: '78% full' },
        { module: t('modules.maintenance'), status: 'warning', detail: '2 overdue' },
        { module: t('modules.guardTour'), status: 'ok', detail: 'On schedule' },
        { module: t('modules.iotEnergy'), status: 'ok', detail: '142 kWh today' },
      ],
    },
  ];

  // Combine real-time events with API fallback
  const realtimeAccessEvents = realtimeEvents.map(realtimeEventToAccessEvent);
  const apiEvents: AccessEvent[] = (statsData?.recent_events ?? []).map(eventDtoToAccessEvent);

  const events = realtimeAccessEvents.length > 0
    ? [...realtimeAccessEvents, ...apiEvents.filter((e) => !realtimeAccessEvents.some((w) => w.id === e.id))].slice(0, 10)
    : apiEvents.slice(0, 10);

  // Convert real-time alarms to alert format
  const realtimeAlerts = activeAlarms.map((alarm) => ({
    id: alarm.id,
    title: `${alarm.alarmType}: ${alarm.doorId || alarm.zone || 'Unknown location'}`,
    meta: `Device ${alarm.deviceId} · ${Math.floor((Date.now() - alarm.time.getTime()) / 60000)}m ago`,
    severity: alarm.severity,
  }));

  // Fallback static alerts for demo
  const staticAlerts = [
    { id: '1', title: 'Door 5 forced open', meta: 'Building A, Floor 3 · 2m ago', severity: 'critical' },
    { id: '2', title: 'Intrusion alarm — Zone B', meta: 'Perimeter sensor · 5m ago', severity: 'critical' },
    { id: '3', title: 'NVR-02 storage at 90%', meta: 'Camera storage · 12m ago', severity: 'warning' },
    { id: '4', title: 'Door 12 reader offline', meta: 'Building B, Floor 1 · 28m ago', severity: 'info' },
    { id: '5', title: 'Scheduled maintenance due', meta: 'Turnstile 3 · 1h ago', severity: 'info' },
  ];

  const alerts = realtimeAlerts.length > 0 ? realtimeAlerts : staticAlerts;

  return (
    <div>
      <PageHeader title={t('title')}>
        <div className="flex gap-2">
          <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]">
            <Building2 size={14} /> Landmark 81 ▾
          </button>
          <button type="button" className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]">
            <Calendar size={14} /> Today ▾
          </button>
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-md text-foreground text-[12px]">
            <span className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-success animate-pulse' :
              isConnecting ? 'bg-warning animate-pulse' :
              'bg-error'
            )} />
            {isConnected ? t('events.live') : isConnecting ? t('status.connecting') : t('status.offline')}
          </div>
        </div>
      </PageHeader>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      {/* Middle: Events + Alerts */}
      <div className="grid grid-cols-[1.8fr_1fr] gap-4 mb-6">
        {/* Live Events */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-[13px] font-semibold flex items-center gap-2">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full',
                isConnected ? 'bg-success animate-pulse' : 'bg-error'
              )} />
              {t('events.title')} ({isConnected ? t('events.live') : t('events.cached')})
            </div>
            <span className="text-[12px] text-secure cursor-pointer hover:underline">{t('events.viewAll')}</span>
          </div>
          <div className="px-4 py-3">
            <div className="h-10 mb-3 rounded bg-linear-to-b from-transparent to-secure/10 relative overflow-hidden">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 40" preserveAspectRatio="none">
                <path d="M0,35 Q20,30 40,28 T80,20 T120,25 T160,15 T200,10 T240,18 T280,8 T320,12 T360,6 T400,10" fill="none" stroke="currentColor" className="text-secure" strokeWidth="2" />
              </svg>
            </div>
            <EventFeed events={events} />
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-[13px] font-semibold flex items-center gap-2">
              <AlertTriangle size={14} className="text-warning" />
              {t('alerts.title')}
            </div>
            <span className="text-[12px] text-secure cursor-pointer hover:underline">{t('alerts.viewAll')}</span>
          </div>
          <div className="px-4 py-3 space-y-0">
            {alerts.map((a) => (
              <div key={a.id} className="flex gap-2.5 py-2.5 border-b border-border/50 last:border-0">
                <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', severityDot[a.severity])} />
                <div>
                  <div className="text-[13px] font-medium text-foreground">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{a.meta}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Domain Health */}
      <div className="grid grid-cols-3 gap-4">
        {domainHealthData.map((d) => {
          const DomainIcon = d.Icon;
          return (
            <div key={d.domain} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <DomainIcon size={16} className={d.colorCls} />
                <span className={cn('font-semibold text-[14px]', d.colorCls)}>{d.domain}</span>
              </div>
              {d.items.map((item) => {
                const StatusIcon = item.status === 'warning' ? AlertTriangle : item.status === 'critical' ? AlertTriangle : Check;
                return (
                  <div key={item.module} className="flex items-center justify-between py-1 text-[12px]">
                    <span className="text-foreground">{item.module}</span>
                    <span className={cn('text-[11px] inline-flex items-center gap-1', healthStatusClass[item.status])}>
                      <StatusIcon size={11} /> {item.detail}
                    </span>
                  </div>
                );
              })}
              <div className="mt-3">
                <span className="text-[12px] text-secure cursor-pointer hover:underline">
                  {d.viewLink}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
