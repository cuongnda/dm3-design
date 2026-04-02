import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader, useToast, Button, Input, Label, Select, SelectOption } from '@dm3/ui';
import { me as fetchMe, updatePreferredLanguage } from '@dm3/api-client';
import { cn } from '@/lib/utils';
import { userProfile, sessions, notificationSettings } from './mock-data';
import { useThemeStore } from '@/stores/themeStore';

type Tab = 'profile' | 'security' | 'notifications' | 'appearance';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" onClick={onChange} className={cn('w-10 h-5 rounded-full transition-colors relative', checked ? 'bg-smart' : 'bg-muted')}>
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform', checked ? 'left-5' : 'left-0.5')} />
    </button>
  );
}

function FormField({ label, value, type = 'text' }: { label: string; value: string; type?: string }) {
  return (
    <div>
      <Label className="text-[12px]">{label}</Label>
      <Input
        type={type}
        defaultValue={value}
        className="mt-1"
      />
    </div>
  );
}

export function SettingsPage() {
  const { t, i18n } = useTranslation('settings');
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('profile');
  const [notifs, setNotifs] = useState(notificationSettings);
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const [pendingLang, setPendingLang] = useState<'en' | 'vi'>(() => (i18n.language?.split('-')[0] ?? 'en') as 'en' | 'vi');

  useEffect(() => {
    setPendingLang((i18n.language?.split('-')[0] ?? 'en') as 'en' | 'vi');
  }, [i18n.language]);

  const handleSaveAppearance = async () => {
    const current = (i18n.language?.split('-')[0] ?? 'en') as 'en' | 'vi';
    if (current === pendingLang) return;

    const token = localStorage.getItem('dm3-token');
    if (!token) return;

    try {
      await updatePreferredLanguage(pendingLang);
      const updated = await fetchMe();
      const serverLang = (updated.preferred_language ?? '').split('-')[0]?.toLowerCase();
      const normalized = serverLang === 'vi' ? 'vi' : 'en';
      i18n.changeLanguage(normalized);
      localStorage.setItem('dm3-lang', normalized);
      showToast({
        title: t('profile.saveSuccess'),
        type: 'success',
      });
    } catch {
      // If backend fails, keep current UI language (do not change i18n)
      setPendingLang(current);
      showToast({
        title: 'Failed to save language',
        type: 'error',
      });
    }
  };

  const handleSaveProfile = () => {
    // Current SettingsPage uses mock profile data; wire-to-backend will come later.
    showToast({
      title: t('profile.saveSuccess'),
      type: 'success',
    });
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'profile', label: t('settings.tabs.profile'), icon: '👤' },
    { key: 'security', label: t('settings.tabs.security'), icon: '🔒' },
    { key: 'notifications', label: t('settings.tabs.notifications'), icon: '🔔' },
    { key: 'appearance', label: t('settings.tabs.appearance'), icon: '🎨' },
  ];

  return (
    <div>
      <PageHeader title={t('settings.title')} description={t('settings.description')} />

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-48 space-y-1">
          {tabs.map(t => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn(
              'w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer',
                tab === t.key ? 'bg-smart/10 text-smart border border-smart/30' : 'text-muted-foreground hover:text-foreground hover:bg-card'
            )}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
          <div className="flex-1 bg-card border border-border rounded-lg p-6">
          {tab === 'profile' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('profile.title')}</h3>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-smart/20 border border-smart/50 flex items-center justify-center text-[24px]">👤</div>
                <div>
                  <div className="text-[14px] font-medium text-foreground">{userProfile.name}</div>
                  <div className="text-[12px] text-muted-foreground">{userProfile.role} · {userProfile.department}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t('profile.firstName')} value={userProfile.name} />
                <FormField label={t('profile.email')} value={userProfile.email} type="email" />
                <FormField label={t('profile.phone')} value={userProfile.phone} type="tel" />
                <FormField label={t('profile.department')} value={userProfile.department} />
              </div>
              <Button onClick={handleSaveProfile} className="mt-4">
                {t('profile.save')}
              </Button>
            </div>
          )}

          {tab === 'security' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('security.title')}</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="text-[13px] font-medium text-foreground mb-2">{t('security.password')}</h4>
                  <div className="grid grid-cols-1 gap-3 max-w-md">
                    <FormField label={t('security.currentPassword')} value="" type="password" />
                    <FormField label={t('security.newPassword')} value="" type="password" />
                    <FormField label={t('security.confirmPassword')} value="" type="password" />
                  </div>
                  <Button className="mt-3">{t('security.changePassword')}</Button>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-foreground mb-2">{t('security.twoFactor')}</h4>
                  <div className="flex items-center justify-between bg-card rounded-md p-3 max-w-md">
                    <div>
                      <div className="text-[13px] text-foreground">Google Authenticator</div>
                      <div className="text-[11px] text-muted-foreground">{t('security.twoFactorDisabled')}</div>
                    </div>
                    <Button size="sm" className="bg-operate hover:bg-operate/90">{t('security.enable2FA')}</Button>
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-foreground mb-2">{t('security.sessions')}</h4>
                  <div className="space-y-2 max-w-lg">
                    {sessions.map(s => (
                      <div key={s.id} className="flex items-center justify-between bg-card rounded-md p-3">
                        <div>
                          <div className="text-[13px] text-foreground">{s.device} {s.current && <span className="text-[10px] text-success ml-1">● {t('security.currentSession')}</span>}</div>
                          <div className="text-[11px] text-muted-foreground">{s.location} · {s.lastActive}</div>
                        </div>
                        {!s.current && <Button variant="ghost" size="xs" className="text-error hover:text-error">{t('security.signOutAll')}</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'notifications' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('notifications.title')}</h3>
              <div className="space-y-4 max-w-md">
                {[
                  { key: 'email' as const, label: t('notifications.email') },
                  { key: 'push' as const, label: t('notifications.push') },
                  { key: 'sms' as const, label: 'SMS' },
                  { key: 'securityAlerts' as const, label: t('notifications.types.security') },
                  { key: 'maintenanceUpdates' as const, label: t('notifications.types.maintenance') },
                  { key: 'bookingReminders' as const, label: 'Booking Reminders' },
                  { key: 'weeklyReport' as const, label: 'Weekly Report' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between bg-card rounded-md p-3">
                    <span className="text-[13px] text-foreground">{item.label}</span>
                    <Toggle checked={notifs[item.key]} onChange={() => setNotifs(prev => ({ ...prev, [item.key]: !prev[item.key] }))} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'appearance' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('appearance.title')}</h3>
              <div className="space-y-4 max-w-md">
                <div>
                  <label className="block text-[12px] text-muted-foreground mb-2">{t('appearance.theme')}</label>
                  <div className="flex gap-3">
                    {[
                      { key: 'dark', label: `🌙 ${t('appearance.theme.dark')}`, desc: 'Dark theme (default)' },
                      { key: 'light', label: `☀️ ${t('appearance.theme.light')}`, desc: 'Light theme' },
                      { key: 'auto', label: `🔄 ${t('appearance.theme.auto')}`, desc: 'Follow system' },
                    ].map(themeOption => (
                      <button
                        key={themeOption.key}
                        type="button"
                        onClick={() => {
                          if (themeOption.key === 'auto') {
                            const prefersLight =
                              typeof window !== 'undefined' &&
                              window.matchMedia &&
                              window.matchMedia('(prefers-color-scheme: light)').matches;
                            setTheme(prefersLight ? 'light' : 'dark');
                          } else {
                            setTheme(themeOption.key as 'dark' | 'light');
                          }
                        }}
                        className={cn(
                          'flex-1 p-3 rounded-md border text-center transition-colors cursor-pointer',
                          themeOption.key !== 'auto' && theme === themeOption.key
                            ? 'bg-smart/10 border-smart/50'
                            : 'bg-card border-border hover:border-smart/30'
                        )}
                      >
                        <div className="text-[14px] mb-1">{themeOption.label}</div>
                        <div className="text-[11px] text-muted-foreground">{themeOption.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-[12px] mb-2 block">{t('appearance.language')}</Label>
                  {/* Normalize like `vi-VN` -> `vi` so the dropdown stays consistent */}
                  <Select
                    value={pendingLang}
                    onChange={(e) => setPendingLang((e.target.value === 'vi' ? 'vi' : 'en') as 'en' | 'vi')}
                  >
                    <SelectOption value="vi">🇻🇳 {t('appearance.language.vi')}</SelectOption>
                    <SelectOption value="en">🇺🇸 {t('appearance.language.en')}</SelectOption>
                  </Select>
                  <Button onClick={handleSaveAppearance} className="mt-4">
                    {t('profile.save')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
