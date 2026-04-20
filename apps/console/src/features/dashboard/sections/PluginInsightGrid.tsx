import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { usePlugin } from '../hooks/usePlugin';
import { ParkingDashCard } from '../cards/ParkingDashCard';
import { VisitorDashCard } from '../cards/VisitorDashCard';
import { CctvDashCard } from '../cards/CctvDashCard';
import { AttendanceDashCard } from '../cards/AttendanceDashCard';
import { ApiIntegrationDashCard } from '../cards/ApiIntegrationDashCard';

export function PluginInsightGrid(): React.ReactElement | null {
  const { t } = useTranslation('dashboard');
  const parkingEnabled = usePlugin('parking');
  const visitorEnabled = usePlugin('visitor');
  const cctvEnabled = usePlugin('cctv');
  const attendanceEnabled = usePlugin('attendance');
  const apiEnabled = usePlugin('api_integration');

  const anyEnabled =
    parkingEnabled ||
    visitorEnabled ||
    cctvEnabled ||
    attendanceEnabled ||
    apiEnabled;

  if (!anyEnabled) {
    return null;
  }

  return (
    <section data-testid="dashboard-section-plugin-insights" className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-platform" />
        <h2 className="text-[13px] font-semibold text-foreground uppercase tracking-wide">
          {t('insight.title', 'Plugin Insights')}
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {parkingEnabled && <ParkingDashCard />}
        {visitorEnabled && <VisitorDashCard />}
        {cctvEnabled && <CctvDashCard />}
        {attendanceEnabled && <AttendanceDashCard />}
        {apiEnabled && <ApiIntegrationDashCard />}
      </div>
    </section>
  );
}
