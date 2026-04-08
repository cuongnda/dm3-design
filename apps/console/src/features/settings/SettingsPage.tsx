import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Shield, Bell, Palette, Save, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@dm3/ui';

type Tab = 'profile' | 'security' | 'notifications' | 'appearance';

export function SettingsPage() {
  const { t } = useTranslation();
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
    theme: 'light',
    language: 'en'
  });

  const tabs = [
    { id: 'profile' as Tab, label: 'Profile', icon: User },
    { id: 'security' as Tab, label: 'Security', icon: Shield },
    { id: 'notifications' as Tab, label: 'Notifications', icon: Bell },
    { id: 'appearance' as Tab, label: 'Appearance', icon: Palette }
  ];

  const handleSave = () => {
    // Save handled by individual tab forms
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-muted-foreground">Manage your account and application preferences</p>
        </div>
        <Button onClick={handleSave}>
          <Save size={16} className="mr-2" />
          Save Changes
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
                  const tab = tabs.find(t => t.id === activeTab);
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
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="Enter your email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="Enter your phone number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="position">Position</Label>
                    <Input
                      id="position"
                      value={profile.position}
                      onChange={(e) => setProfile(prev => ({ ...prev, position: e.target.value }))}
                      placeholder="Enter your position"
                    />
                  </div>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={security.currentPassword}
                      onChange={(e) => setSecurity(prev => ({ ...prev, currentPassword: e.target.value }))}
                      placeholder="Enter current password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={security.newPassword}
                      onChange={(e) => setSecurity(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Enter new password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={security.confirmPassword}
                      onChange={(e) => setSecurity(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm new password"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="twoFactor"
                      checked={security.twoFactorEnabled}
                      onChange={(e) => setSecurity(prev => ({ ...prev, twoFactorEnabled: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="twoFactor">Enable Two-Factor Authentication</Label>
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="emailAlerts"
                      checked={notifications.emailAlerts}
                      onChange={(e) => setNotifications(prev => ({ ...prev, emailAlerts: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="emailAlerts">Email Alerts</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="smsAlerts"
                      checked={notifications.smsAlerts}
                      onChange={(e) => setNotifications(prev => ({ ...prev, smsAlerts: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="smsAlerts">SMS Alerts</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="pushNotifications"
                      checked={notifications.pushNotifications}
                      onChange={(e) => setNotifications(prev => ({ ...prev, pushNotifications: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="pushNotifications">Push Notifications</Label>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="weeklyReports"
                      checked={notifications.weeklyReports}
                      onChange={(e) => setNotifications(prev => ({ ...prev, weeklyReports: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <Label htmlFor="weeklyReports">Weekly Reports</Label>
                  </div>
                </div>
              )}

              {/* Appearance Tab */}
              {activeTab === 'appearance' && (
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="theme">Theme</Label>
                    <select
                      id="theme"
                      value={appearance.theme}
                      onChange={(e) => setAppearance(prev => ({ ...prev, theme: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                      <option value="auto">Auto</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="language">Language</Label>
                    <select
                      id="language"
                      value={appearance.language}
                      onChange={(e) => setAppearance(prev => ({ ...prev, language: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="en">English</option>
                      <option value="vi">Tiếng Việt</option>
                    </select>
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