import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Phone } from 'lucide-react';
import { PluginEmptyCard } from './PluginEmptyCard';

export function IntercomDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  return (
    <PluginEmptyCard
      testId="dashboard-card-intercom"
      title={t('insight.intercom', 'Intercom')}
      icon={<Phone size={16} />}
      colorCls="text-secure"
      message={t(
        'insight.intercomHint',
        'Video intercom with remote door unlock. Route calls to the right operator.',
      )}
      cta={{
        label: t('insight.viewIntercom', 'Open Intercom →'),
        onClick: () => navigate('/secure/intercom'),
      }}
    />
  );
}
