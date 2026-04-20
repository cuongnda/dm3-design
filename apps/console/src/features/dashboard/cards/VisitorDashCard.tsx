import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useVisitorSummary } from '../hooks/useVisitorSummary';

export function VisitorDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  const { data, isLoading, isError } = useVisitorSummary();

  const waiting = data?.waiting ?? 0;
  const checkedIn = data?.checked_in ?? 0;
  const checkedOut = data?.checked_out ?? 0;
  const noShow = data?.no_show ?? 0;

  return (
    <div
      data-testid="dashboard-card-visitor"
      className="bg-card border border-border rounded-lg p-4 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-manage" />
          <span className="text-[13px] font-semibold text-foreground">
            {t('insight.visitorQueue', 'Visitor Queue')}
          </span>
        </div>
        <button
          type="button"
          data-testid="dashboard-card-visitor-cta"
          onClick={() => navigate('/manage/visitors')}
          className="text-[12px] text-secure hover:underline"
        >
          {t('insight.viewVisitors', 'View Visitors →')}
        </button>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-8 bg-muted/30 rounded w-1/3" />
          <div className="h-3 bg-muted/30 rounded w-2/3" />
        </div>
      ) : isError || !data ? (
        <div className="text-[12px] text-muted-foreground">
          {t('plugin.noData', 'No data available')}
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="text-[28px] font-semibold tracking-tight text-manage">
              {waiting}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {t('insight.visitorWaiting', 'waiting')}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px] mt-auto">
            <Stat
              label={t('insight.visitorCheckedIn', 'Checked in')}
              value={checkedIn}
              tone="text-success"
            />
            <Stat
              label={t('insight.visitorCheckedOut', 'Checked out')}
              value={checkedOut}
              tone="text-foreground"
            />
            <Stat
              label={t('insight.visitorNoShow', 'No-show')}
              value={noShow}
              tone="text-warning"
            />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="bg-muted/20 rounded px-2 py-1.5">
      <div className={`text-[14px] font-semibold ${tone}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
