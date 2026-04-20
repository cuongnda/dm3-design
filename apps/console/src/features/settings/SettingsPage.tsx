import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Bell, FileText, Mail, Save, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Checkbox } from '@dm3/ui';

type Tab = 'security' | 'notifications';

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('security');
  const [security, setSecurity] = useState({
    twoFactorEnabled: false
  });
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    pushNotifications: true,
    weeklyReports: true
  });

  const tabs = [
    { id: 'security' as Tab, label: t('settings.tabs.security'), icon: Shield },
    { id: 'notifications' as Tab, label: t('settings.tabs.notifications'), icon: Bell },
  ];

  const handleSave = () => {
    // Save handled by individual tab forms
  };

  return (
    <div className="space-y-6 p-6 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.description')}</p>
        </div>
        <Button onClick={handleSave}>
          <Save size={16} className="mr-2" />
          {t('profile.save')}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <nav className="space-y-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <Icon size={18} />
                  {tab.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => navigate('/settings/roles')}
              className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors hover:bg-muted"
              data-testid="settings-link-roles"
            >
              <Users size={18} />
              {t('settings.tabs.roles')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings/email-templates')}
              className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors hover:bg-muted"
            >
              <Mail size={18} />
              {t('settings.tabs.emailTemplates')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings/audit-log')}
              className="w-full flex items-center gap-3 px-3 py-2 text-left rounded-md transition-colors hover:bg-muted"
            >
              <FileText size={18} />
              {t('settings.tabs.auditLog')}
            </button>
          </nav>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {(() => {
                  const tab = tabs.find(tb => tb.id === activeTab);
                  const Icon = tab?.icon || Shield;
                  return (
                    <>
                      <Icon size={20} />
                      {tab?.label}
                    </>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="twoFactor"
                      checked={security.twoFactorEnabled}
                      onCheckedChange={(checked) => setSecurity(prev => ({ ...prev, twoFactorEnabled: !!checked }))}
                      data-testid="settings-input-twoFactor"
                    />
                    <Label htmlFor="twoFactor">{t('security.twoFactor')}</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {security.twoFactorEnabled ? t('security.twoFactorEnabled') : t('security.twoFactorDisabled')}
                  </p>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="emailAlerts"
                      checked={notifications.emailAlerts}
                      onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, emailAlerts: !!checked }))}
                      data-testid="settings-input-emailAlerts"
                    />
                    <Label htmlFor="emailAlerts">{t('notifications.email')}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="smsAlerts"
                      checked={notifications.smsAlerts}
                      onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, smsAlerts: !!checked }))}
                      data-testid="settings-input-smsAlerts"
                    />
                    <Label htmlFor="smsAlerts">{t('notifications.types.security')}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="pushNotifications"
                      checked={notifications.pushNotifications}
                      onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, pushNotifications: !!checked }))}
                      data-testid="settings-input-pushNotifications"
                    />
                    <Label htmlFor="pushNotifications">{t('notifications.push')}</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="weeklyReports"
                      checked={notifications.weeklyReports}
                      onCheckedChange={(checked) => setNotifications(prev => ({ ...prev, weeklyReports: !!checked }))}
                      data-testid="settings-input-weeklyReports"
                    />
                    <Label htmlFor="weeklyReports">{t('notifications.frequency.weekly')}</Label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
