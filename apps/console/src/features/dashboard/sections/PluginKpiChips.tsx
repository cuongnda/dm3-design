import { useTranslation } from 'react-i18next';
import { CircleParking, Users, Camera, ClipboardCheck } from 'lucide-react';
import { StatCard } from '@dm3/ui';
import { usePlugin } from '../hooks/usePlugin';
import { useParkingDashboard } from '../hooks/useParkingDashboard';
import { useVisitorSummary } from '../hooks/useVisitorSummary';
import { useCctvSummary } from '../hooks/useCctvSummary';
import { useAttendanceSummary } from '../hooks/useAttendanceSummary';

export function PluginKpiChips(): React.ReactElement | null {
  const { t } = useTranslation('dashboard');

  const parkingEnabled = usePlugin('parking');
  const visitorEnabled = usePlugin('visitor');
  const cctvEnabled = usePlugin('cctv');
  const attendanceEnabled = usePlugin('attendance');

  const parking = useParkingDashboard();
  const visitor = useVisitorSummary();
  const cctv = useCctvSummary();
  const attendance = useAttendanceSummary();

  const anyEnabled =
    parkingEnabled || visitorEnabled || cctvEnabled || attendanceEnabled;
  if (!anyEnabled) {
    return null;
  }

  const chips: React.ReactElement[] = [];

  if (parkingEnabled) {
    const occupancy = parking.data ? Math.round(parking.data.occupancy_percent) : 0;
    const occupied = parking.data?.occupied_spaces ?? 0;
    const total = parking.data?.total_spaces ?? 0;
    chips.push(
      <StatCard
        key="parking"
        label={t('plugin.parkingOccupancy', 'Parking Occupancy')}
        value={parking.data ? `${occupancy}%` : '—'}
        sub={
          parking.data
            ? `${occupied} / ${total} ${t('plugin.parkingSpots', 'spots')}`
            : t('plugin.noData', 'No data available')
        }
        icon={<CircleParking size={14} />}
        domain="operate"
      />,
    );
  }

  if (visitorEnabled) {
    const waiting = visitor.data?.waiting ?? 0;
    const checkedIn = visitor.data?.checked_in ?? 0;
    chips.push(
      <StatCard
        key="visitor"
        label={t('plugin.visitorsWaiting', 'Visitors Waiting')}
        value={visitor.data ? String(waiting) : '—'}
        sub={
          visitor.data
            ? `${checkedIn} ${t('plugin.visitorsCheckedIn', 'checked in')}`
            : t('plugin.noData', 'No data available')
        }
        icon={<Users size={14} />}
        domain="manage"
      />,
    );
  }

  if (cctvEnabled) {
    const total = cctv.data?.total ?? 0;
    const online = cctv.data?.online ?? 0;
    const offline = Math.max(0, total - online);
    chips.push(
      <StatCard
        key="cctv"
        label={t('plugin.camerasOnline', 'Cameras Online')}
        value={cctv.data ? `${online}/${total}` : '—'}
        sub={
          cctv.data
            ? `${offline} ${t('plugin.camerasOffline', 'offline')}`
            : t('plugin.noData', 'No data available')
        }
        trend={{
          direction: offline === 0 ? 'up' : 'down',
          text: offline === 0 ? t('plugin.allOnline', 'all online') : `${offline} offline`,
        }}
        icon={<Camera size={14} />}
        domain="secure"
      />,
    );
  }

  if (attendanceEnabled) {
    const clockedIn = attendance.data?.clocked_in ?? 0;
    const late = attendance.data?.late ?? 0;
    chips.push(
      <StatCard
        key="attendance"
        label={t('plugin.clockInsToday', "Today's Clock-ins")}
        value={attendance.data ? String(clockedIn) : '—'}
        sub={
          attendance.data
            ? `${late} ${t('plugin.attendanceLate', 'late')}`
            : t('plugin.noData', 'No data available')
        }
        icon={<ClipboardCheck size={14} />}
        domain="manage"
      />,
    );
  }

  return (
    <div
      data-testid="dashboard-section-plugin-kpi"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6"
    >
      {chips}
    </div>
  );
}
