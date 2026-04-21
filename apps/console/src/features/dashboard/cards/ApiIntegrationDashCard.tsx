import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Plug } from 'lucide-react';
import { PluginEmptyCard } from './PluginEmptyCard';

export function ApiIntegrationDashCard(): React.ReactElement {
  const { t } = useTranslation('dashboard');
  const navigate = useNavigate();
  return (
    <PluginEmptyCard
      testId="dashboard-card-api-integration"
      title={t('insight.apiIntegration', 'API Integration')}
      icon={<Plug size={16} />}
      colorCls="text-platform"
      message={t(
        'insight.apiIntegrationHint',
        'Manage API tokens and OAuth clients for third-party integrations.',
      )}
      cta={{
        label: t('insight.viewApiTokens', 'Manage Tokens →'),
        onClick: () => navigate('/settings/api-tokens'),
      }}
    />
  );
}
