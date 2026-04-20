import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { useAttendanceSummary } from '../hooks/useAttendanceSummary';
import { PluginEmptyCard } from './PluginEmptyCard';

export function AttendanceDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data, isLoading, isError } = useAttendanceSummary();

  const cta = {
    label: t('insight.viewAttendance', 'View Attendance →'),
    onClick: () => navigate('/manage/attendance'),
  };

  if (isError || (!isLoading && !data)) {
    return (
      <PluginEmptyCard
        testId="dashboard-card-attendance"
        title={t('insight.attendanceToday', 'Attendance Today')}
        icon={<ClipboardCheck size={16} />}
        colorCls="text-manage"
        message={t('plugin.noData', 'No data available')}
        cta={cta}
      />
    );
  }

  const onTime = data?.on_time ?? 0;
  const late = data?.late ?? 0;
  const absent = data?.absent ?? 0;
  const onLeave = data?.on_leave ?? 0;
  const clockedIn = data?.clocked_in ?? 0;

  return (
    <div
      data-testid="dashboard-card-attendance"
      className="bg-card border border-border rounded-lg p-4 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck size={16} className="text-manage" />
          <span className="text-[13px] font-semibold text-foreground">
            {t('insight.attendanceToday', 'Attendance Today')}
          </span>
        </div>
        <button
          type="button"
          data-testid="dashboard-card-attendance-cta"
          onClick={cta.onClick}
          className="text-[12px] text-secure hover:underline"
        >
          {cta.label}
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded w-1/3" />
          <div className="h-3 bg-muted/30 rounded w-2/3" />
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-[28px] font-semibold tracking-tight text-manage">
              {clockedIn}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {t('insight.attendanceClockedIn', 'clocked in')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[11px] mt-auto">
            <Stat label={t('insight.attendanceOnTime', 'On time')} value={onTime} tone="text-success" />
            <Stat label={t('insight.attendanceLate', 'Late')} value={late} tone="text-warning" />
            <Stat label={t('insight.attendanceAbsent', 'Absent')} value={absent} tone="text-error" />
            <Stat label={t('insight.attendanceOnLeave', 'On leave')} value={onLeave} tone="text-foreground" />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-muted/20 rounded px-2 py-1.5">
      <div className={`text-[14px] font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
