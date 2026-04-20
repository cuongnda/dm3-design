import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Building2, Check, Lock, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlugin } from '../hooks/usePlugin';
import { useCctvSummary } from '../hooks/useCctvSummary';
import { useVisitorSummary } from '../hooks/useVisitorSummary';
import { useAttendanceSummary } from '../hooks/useAttendanceSummary';
import { useParkingDashboard } from '../hooks/useParkingDashboard';

type Status = 'ok' | 'warning' | 'critical';

interface HealthItem {
  module: string;
  status: Status;
  detail: string;
}

interface DomainSection {
  key: string;
  domain: string;
  colorCls: string;
  Icon: typeof Lock;
  items: HealthItem[];
  viewLink: string;
  route: string;
}

const healthStatusClass: Record<Status, string> = {
  ok: 'text-success',
  warning: 'text-warning',
  critical: 'text-error',
};

export function DomainHealthGrid(): React.ReactElement | null {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();

  const cctvEnabled = usePlugin('cctv');
  const visitorEnabled = usePlugin('visitor');
  const attendanceEnabled = usePlugin('attendance');
  const parkingEnabled = usePlugin('parking');

  const cctv = useCctvSummary();
  const visitor = useVisitorSummary();
  const attendance = useAttendanceSummary();
  const parking = useParkingDashboard();

  const secureItems: HealthItem[] = [
    { module: t('modules.accessControl'), status: 'ok', detail: t('health.online', 'Online') },
  ];
  if (cctvEnabled) {
    const total = cctv.data?.total ?? 0;
    const online = cctv.data?.online ?? 0;
    const offline = Math.max(0, total - online);
    secureItems.push({
      module: t('modules.cctv'),
      status: offline > 0 ? 'warning' : 'ok',
      detail: cctv.data
        ? offline > 0
          ? `${offline} ${t('plugin.camerasOffline', 'offline')}`
          : t('plugin.allOnline', 'all online')
        : t('plugin.noData', 'No data available'),
    });
  }

  const manageItems: HealthItem[] = [];
  if (visitorEnabled) {
    const waiting = visitor.data?.waiting ?? 0;
    manageItems.push({
      module: t('modules.visitors'),
      status: 'ok',
      detail: visitor.data
        ? `${waiting} ${t('plugin.visitorsWaiting', 'waiting').toLowerCase()}`
        : t('plugin.noData', 'No data available'),
    });
  }
  if (attendanceEnabled) {
    const clockedIn = attendance.data?.clocked_in ?? 0;
    const late = attendance.data?.late ?? 0;
    manageItems.push({
      module: t('modules.attendance'),
      status: late > 0 ? 'warning' : 'ok',
      detail: attendance.data
        ? `${clockedIn} in · ${late} ${t('plugin.attendanceLate', 'late')}`
        : t('plugin.noData', 'No data available'),
    });
  }

  const operateItems: HealthItem[] = [];
  if (parkingEnabled) {
    const pct = parking.data ? Math.round(parking.data.occupancy_percent) : 0;
    operateItems.push({
      module: t('modules.parking'),
      status: pct >= 90 ? 'critical' : pct >= 75 ? 'warning' : 'ok',
      detail: parking.data
        ? `${pct}% ${t('health.full', 'full')}`
        : t('plugin.noData', 'No data available'),
    });
  }

  const sections: DomainSection[] = [
    {
      key: 'secure',
      domain: t('domain.secure'),
      colorCls: 'text-secure',
      Icon: Lock,
      viewLink: t('health.viewSecurity'),
      route: '/alerts',
      items: secureItems,
    },
  ];
  if (manageItems.length > 0) {
    sections.push({
      key: 'manage',
      domain: t('domain.manage'),
      colorCls: 'text-manage',
      Icon: UserCog,
      viewLink: t('health.viewPeople'),
      route: '/manage/users',
      items: manageItems,
    });
  }
  if (operateItems.length > 0) {
    sections.push({
      key: 'operate',
      domain: t('domain.operate'),
      colorCls: 'text-operate',
      Icon: Building2,
      viewLink: t('health.viewFacility'),
      route: parkingEnabled ? '/parking' : '/devices',
      items: operateItems,
    });
  }

  if (sections.length === 0) {
    return null;
  }

  const gridClass =
    sections.length === 1
      ? 'grid grid-cols-1 gap-4'
      : sections.length === 2
      ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
      : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4';

  return (
    <div data-testid="dashboard-section-domain-health" className={gridClass}>
      {sections.map((d) => {
        const DomainIcon = d.Icon;
        return (
          <div key={d.key} className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <DomainIcon size={16} className={d.colorCls} />
              <span className={cn('font-semibold text-[14px]', d.colorCls)}>
                {d.domain}
              </span>
            </div>
            {d.items.map((item) => {
              const StatusIcon =
                item.status === 'warning' || item.status === 'critical'
                  ? AlertTriangle
                  : Check;
              return (
                <div
                  key={item.module}
                  className="flex items-center justify-between py-1 text-[12px]"
                >
                  <span className="text-foreground">{item.module}</span>
                  <span
                    className={cn(
                      'text-[11px] inline-flex items-center gap-1',
                      healthStatusClass[item.status],
                    )}
                  >
                    <StatusIcon size={11} /> {item.detail}
                  </span>
                </div>
              );
            })}
            <div className="mt-3">
              <button
                type="button"
                data-testid={`dashboard-section-domain-health-${d.key}-cta`}
                onClick={() => navigate(d.route)}
                className="text-[12px] text-secure hover:underline"
              >
                {d.viewLink}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
