import { useTranslation } from 'react-i18next';
import { AlertTriangle, Cpu, Lock, SquareActivity } from 'lucide-react';
import { StatCard } from '@dm3/ui';
import { useStats, useDevices } from '@/lib/hooks';
import {
  useRealtimeStore,
  useActiveAlarms,
  useDeviceStatus,
} from '@dm3/api-client';
import type { RealtimeDeviceStatus } from '@dm3/api-client';

export function CoreKpiStrip(): React.ReactElement {
  const { t } = useTranslation('dashboard');

  const { data: statsData } = useStats();
  const { data: devicesData } = useDevices();

  const isConnected = useRealtimeStore((s) => s.connected);
  const isConnecting = useRealtimeStore((s) => s.connecting);
  const activeAlarms = useActiveAlarms();
  const deviceStatuses = useDeviceStatus() as RealtimeDeviceStatus[];

  const devicesOnline =
    deviceStatuses.filter((d) => d.online).length ||
    (devicesData?.filter((d) => d.status === 'online').length ?? 0);
  const devicesTotal =
    deviceStatuses.length || (devicesData?.length ?? 0);

  const stats = [
    {
      label: t('stats.eventsToday'),
      value: String(statsData?.events_today ?? 0),
      sub: `${statsData?.granted_today ?? 0} granted, ${statsData?.denied_today ?? 0} denied`,
      trend: {
        direction: 'up' as const,
        text: isConnected
          ? t('status.live')
          : isConnecting
          ? t('status.connecting')
          : t('status.offline'),
      },
      icon: <SquareActivity size={14} />,
      domain: 'default' as const,
    },
    {
      label: t('stats.doors'),
      value: `${statsData?.doors_online ?? 0}/${statsData?.doors_total ?? 0}`,
      sub: t('stats.accessPoints'),
      trend: {
        direction:
          (statsData?.doors_offline ?? 0) > 0 ? ('down' as const) : ('up' as const),
        text: `${statsData?.doors_offline ?? 0} ${t('status.offline')}`,
      },
      icon: <Lock size={14} />,
      domain: 'secure' as const,
    },
    {
      label: t('stats.devicesOnline'),
      value: `${devicesOnline}/${devicesTotal}`,
      sub: t('stats.connectedDevices'),
      trend: {
        direction:
          devicesOnline === devicesTotal ? ('up' as const) : ('down' as const),
        text: `${devicesTotal - devicesOnline} ${t('status.offline')}`,
      },
      icon: <Cpu size={14} />,
      domain: 'default' as const,
    },
    {
      label: t('stats.activeAlerts'),
      value: String(activeAlarms.length),
      sub: t('stats.needAttention'),
      trend: {
        direction:
          activeAlarms.filter((a) => a.severity === 'critical').length > 0
            ? ('down' as const)
            : ('up' as const),
        text: `${activeAlarms.filter((a) => a.severity === 'critical').length} critical`,
      },
      icon: <AlertTriangle size={14} />,
      domain: 'error' as const,
    },
  ];

  return (
    <div
      data-testid="dashboard-section-core-kpi"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6"
    >
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
}
