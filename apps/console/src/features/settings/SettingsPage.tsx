import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Shield, Bell, Palette, Save, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select, SelectOption, Checkbox } from '@dm3/ui';

type Tab = 'profile' | 'security' | 'notifications' | 'appearance';

export function SettingsPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [profile, setProfile] = useState({
    name: 'John Smith',
    email: 'john.smith@company.com',
    phone: '+1234567890',
    position: 'Security Manager'
  });
  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactorEnabled: false
  });
  const [notifications, setNotifications] = useState({
    emailAlerts: true,
    smsAlerts: false,
    pushNotifications: true,
    weeklyReports: true
  });
  const [appearance, setAppearance] = useState({
    theme: 'dark',
    language: 'en'
  });

  const tabs = [
    { id: 'profile' as Tab, label: t('settings.tabs.profile'), icon: User },
    { id: 'security' as Tab, label: t('settings.tabs.security'), icon: Shield },
    { id: 'notifications' as Tab, label: t('settings.tabs.notifications'), icon: Bell },
    { id: 'appearance' as Tab, label: t('settings.tabs.appearance'), icon: Palette }
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
                  const Icon = tab?.icon || User;
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
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">{t('profile.firstName')}</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                      data-testid="settings-input-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">{t('profile.email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                      data-testid="settings-input-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">{t('profile.phone')}</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                      data-testid="settings-input-phone"
                    />
                  </div>
                  <div>
                    <Label htmlFor="position">{t('profile.jobTitle')}</Label>
                    <Input
                      id="position"
                      value={profile.position}
                      onChange={(e) => setProfile(prev => ({ ...prev, position: e.target.value }))}
                      data-testid="settings-input-position"
                    />
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">{t('security.currentPassword')}</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={security.currentPassword}
                      onChange={(e) => setSecurity(prev => ({ ...prev, currentPassword: e.target.value }))}
                      data-testid="settings-input-currentPassword"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">{t('security.newPassword')}</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={security.newPassword}
                      onChange={(e) => setSecurity(prev => ({ ...prev, newPassword: e.target.value }))}
                      data-testid="settings-input-newPassword"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">{t('security.confirmPassword')}</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={security.confirmPassword}
                      onChange={(e) => setSecurity(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      data-testid="settings-input-confirmPassword"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id="twoFactor"
                      checked={security.twoFactorEnabled}
                      onCheckedChange={(checked) => setSecurity(prev => ({ ...prev, twoFactorEnabled: !!checked }))}
                      data-testid="settings-input-twoFactor"
                    />
                    <Label htmlFor="twoFactor">{t('security.twoFactor')}</Label>
                  </div>
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

              {/* Appearance Tab */}
              {activeTab === 'appearance' && (
                <div className="space-y-4">
                  <div>
                    <Label>{t('appearance.theme')}</Label>
                    <Select
                      value={appearance.theme}
                      onValueChange={(v) => setAppearance(prev => ({ ...prev, theme: v }))}
                      data-testid="settings-select-theme"
                    >
                      <SelectOption value="light">{t('appearance.theme.light')}</SelectOption>
                      <SelectOption value="dark">{t('appearance.theme.dark')}</SelectOption>
                      <SelectOption value="auto">{t('appearance.theme.auto')}</SelectOption>
                    </Select>
                  </div>
                  <div>
                    <Label>{t('appearance.language')}</Label>
                    <Select
                      value={appearance.language}
                      onValueChange={(v) => setAppearance(prev => ({ ...prev, language: v }))}
                      data-testid="settings-select-language"
                    >
                      <SelectOption value="en">{t('appearance.language.en')}</SelectOption>
                      <SelectOption value="vi">{t('appearance.language.vi')}</SelectOption>
                    </Select>
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
