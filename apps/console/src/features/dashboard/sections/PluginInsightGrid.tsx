import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { usePlugin } from '../hooks/usePlugin';
import { ParkingDashCard } from '../cards/ParkingDashCard';
import { VisitorDashCard } from '../cards/VisitorDashCard';
import { CctvDashCard } from '../cards/CctvDashCard';
import { AttendanceDashCard } from '../cards/AttendanceDashCard';
import { IntercomDashCard } from '../cards/IntercomDashCard';
import { SmartBuildingDashCard } from '../cards/SmartBuildingDashCard';
import { ApiIntegrationDashCard } from '../cards/ApiIntegrationDashCard';

export function PluginInsightGrid(): React.ReactElement | null {
  const { t } = useTranslation('dashboard');
  const parkingEnabled = usePlugin('parking');
  const visitorEnabled = usePlugin('visitor');
  const cctvEnabled = usePlugin('cctv');
  const attendanceEnabled = usePlugin('attendance');
  const intercomEnabled = usePlugin('intercom');
  const smartBuildingEnabled = usePlugin('smart_building');
  const apiIntegrationEnabled = usePlugin('api_integration');

  const cards: React.ReactElement[] = [];
  if (cctvEnabled) cards.push(<CctvDashCard key="cctv" />);
  if (visitorEnabled) cards.push(<VisitorDashCard key="visitor" />);
  if (attendanceEnabled) cards.push(<AttendanceDashCard key="attendance" />);
  if (parkingEnabled) cards.push(<ParkingDashCard key="parking" />);
  if (intercomEnabled) cards.push(<IntercomDashCard key="intercom" />);
  if (smartBuildingEnabled) cards.push(<SmartBuildingDashCard key="smart_building" />);
  if (apiIntegrationEnabled) cards.push(<ApiIntegrationDashCard key="api_integration" />);

  if (cards.length === 0) {
    return null;
  }

  return (
    <section data-testid="dashboard-section-plugin-insights" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-platform" />
          <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
            {t('insight.title', 'Plugin Insights')}
          </h2>
          <span
            data-testid="dashboard-section-plugin-insights-count"
            className="text-[11px] text-muted-foreground tabular-nums px-1.5 py-0.5 bg-muted/30 rounded"
          >
            {cards.length}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards}
      </div>
    </section>
  );
}
