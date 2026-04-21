import { useTranslation } from 'react-i18next';
import { Building2 } from 'lucide-react';
import { PluginEmptyCard } from './PluginEmptyCard';

export function SmartBuildingDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  return (
    <PluginEmptyCard
      testId="dashboard-card-smart-building"
      title={t('insight.smartBuilding', 'Smart Building')}
      icon={<Building2 size={16} />}
      colorCls="text-smart"
      message={t(
        'insight.smartBuildingHint',
        'HVAC, lighting and occupancy analytics. Telemetry dashboards coming online.',
      )}
    />
  );
}
