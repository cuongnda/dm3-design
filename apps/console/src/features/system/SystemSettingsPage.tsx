import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Check, Database, HardDrive, Lock, Mail, Moon, Settings, Sun, type LucideIcon } from 'lucide-react';
import { PageHeader, useToast, Button, Input, Label, Select, SelectOption, Textarea } from '@dm3/ui';
import { me as fetchMe, updateMePreferences } from '@dm3/api-client';
import { cn } from '@/lib/utils';
import { useThemeStore } from '@/stores/themeStore';

type Tab = 'general' | 'security' | 'email' | 'notifications' | 'backup';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn('w-10 h-5 rounded-full transition-colors relative cursor-pointer', checked ? 'bg-operate' : 'bg-muted')}
    >
      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform', checked ? 'left-5' : 'left-0.5')} />
    </button>
  );
}

function Field({ label, value, type = 'text', placeholder }: { label: string; value: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <Label className="text-[12px]">{label}</Label>
      <Input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        className="mt-1"
      />
    </div>
  );
}

export function SystemSettingsPage() {
  const { t, i18n } = useTranslation('system');
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('general');
  const [saveAckAt, setSaveAckAt] = useState<number | null>(null);
  const [security, setSecurity] = useState({
    requireSpecialChars: true,
    enforce2FA: false,
  });
  const [email, setEmail] = useState({ tls: true });
  const [notifs, setNotifs] = useState({
    emailAlerts: true,
    pushNotifications: true,
    smsAlerts: false,
    criticalOnly: false,
  });
  const [backup, setBackup] = useState({ autoBackup: true });

  const [defaultLang, setDefaultLang] = useState<'en' | 'vi'>(() => (i18n.language?.split('-')[0] ?? 'vi') as 'en' | 'vi');
  const [pendingTimezone, setPendingTimezone] = useState<string>('Asia/Ho_Chi_Minh');
  const [pendingSessionTimeoutMinutes, setPendingSessionTimeoutMinutes] = useState<number>(30);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  useEffect(() => {
    // Load user-specific preferences once; language UI is handled by i18n already.
    fetchMe()
      .then((me) => {
        if (me.timezone) setPendingTimezone(me.timezone);
        if (typeof me.session_timeout_minutes === 'number') setPendingSessionTimeoutMinutes(me.session_timeout_minutes);

        const serverLang = (me.preferred_language ?? '').split('-')[0]?.toLowerCase();
        if (serverLang === 'en' || serverLang === 'vi') setDefaultLang(serverLang as 'en' | 'vi');
      })
      .catch(() => {
        // Ignore; apiFetch already handles auth redirect on 401.
      });
  }, []);

  const handleSave = async () => {
    if (tab === 'general') {
      const desired = defaultLang;

      const token = localStorage.getItem('dm3-token');
      if (token) {
        let success = false;
        try {
          await updateMePreferences({
            preferred_language: desired,
            timezone: pendingTimezone,
            session_timeout_minutes: pendingSessionTimeoutMinutes,
          });

          const updated = await fetchMe();
          const serverLang = (updated.preferred_language ?? '').split('-')[0]?.toLowerCase();
          const confirmed = serverLang === 'vi' ? 'vi' : 'en';

          setDefaultLang(confirmed);
          setPendingTimezone(updated.timezone ?? pendingTimezone);
          if (typeof updated.session_timeout_minutes === 'number') {
            setPendingSessionTimeoutMinutes(updated.session_timeout_minutes);
          }

          i18n.changeLanguage(confirmed);
          localStorage.setItem('dm3-lang', confirmed);
          success = true;
        } catch {
          // If backend fails, keep current UI language and values in-place.
        }

        if (!success) {
          showToast({
            title: 'Failed to save preferences',
            type: 'error',
          });
          return;
        }
      }
    }

    setSaveAckAt(Date.now());
    showToast({
      title: t('systemSettings.saveSuccess'),
      type: 'success',
    });
  };

  const handleChangeDefaultLang = (code: string) => {
    const normalized = (code === 'en' ? 'en' : 'vi') as 'en' | 'vi';
    setDefaultLang(normalized);
  };

  const tabs: { key: Tab; label: string; Icon: LucideIcon }[] = [
    { key: 'general', label: t('systemSettings.tabs.general'), Icon: Settings },
    { key: 'security', label: t('systemSettings.tabs.security'), Icon: Lock },
    { key: 'email', label: t('systemSettings.tabs.email'), Icon: Mail },
    { key: 'notifications', label: t('systemSettings.tabs.monitoring'), Icon: Bell },
    { key: 'backup', label: t('systemSettings.tabs.backup'), Icon: Database },
  ];

  return (
    <div className="p-6">
      <PageHeader title={t('systemSettings.title')} description={t('systemSettings.description')} />

      <div className="flex gap-6">
        {/* Tab sidebar */}
        <div className="w-48 space-y-1">
          {tabs.map((tabItem) => {
            const TabIcon = tabItem.Icon;
            return (
              <button
                key={tabItem.key}
                type="button"
                onClick={() => setTab(tabItem.key)}
                className={cn(
                  'w-full text-left px-3 py-2 rounded-md text-[13px] font-medium transition-colors cursor-pointer flex items-center gap-2',
                  tab === tabItem.key
                    ? 'bg-operate/10 text-operate border border-operate/30'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card'
                )}
              >
                <TabIcon size={14} /> {tabItem.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 bg-card border border-border rounded-lg p-6">
          {tab === 'general' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('general.title')}</h3>
              <div className="grid grid-cols-2 gap-4 max-w-xl">
                <Field label={t('general.systemName')} value="Duall Master" />
                <div>
                  <Label className="text-[12px]">{t('general.timezone')}</Label>
                  <Select
                    value={pendingTimezone}
                    onChange={(e) => setPendingTimezone(e.target.value)}
                    className="mt-1"
                  >
                    <SelectOption value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</SelectOption>
                    <SelectOption value="Asia/Seoul">Asia/Seoul (GMT+9)</SelectOption>
                    <SelectOption value="UTC">UTC</SelectOption>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">{t('general.defaultLanguage')}</Label>
                  <Select
                    value={defaultLang}
                    onChange={(e) => handleChangeDefaultLang(e.target.value)}
                    className="mt-1"
                  >
                    <SelectOption value="vi">{t('general.language.vi')}</SelectOption>
                    <SelectOption value="en">{t('general.language.en')}</SelectOption>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">{t('systemSecurity.sessionTimeout')}</Label>
                  <Input
                    type="number"
                    value={pendingSessionTimeoutMinutes}
                    min={1}
                    max={10080}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPendingSessionTimeoutMinutes(Number.isFinite(v) ? v : 30);
                    }}
                    className="mt-1"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-[12px] mb-2 block">{t('systemTheme.title')}</Label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setTheme('dark')}
                      className={cn(
                        'flex-1 p-3 rounded-md border text-center transition-colors cursor-pointer',
                        theme === 'dark'
                          ? 'bg-card border-ring/60 text-foreground'
                          : 'bg-card border-border hover:border-ring/70 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <div className="text-[14px] mb-1 inline-flex items-center gap-1.5"><Moon size={14} /> {t('systemTheme.dark')}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme('light')}
                      className={cn(
                        'flex-1 p-3 rounded-md border text-center transition-colors cursor-pointer',
                        theme === 'light'
                          ? 'bg-card border-ring/60 text-foreground'
                          : 'bg-card border-border hover:border-ring/70 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <div className="text-[14px] mb-1 inline-flex items-center gap-1.5"><Sun size={14} /> {t('systemTheme.light')}</div>
                    </button>
                  </div>
                </div>
              </div>
              <Button onClick={handleSave} className="mt-6">
                {t('systemSettings.saveChanges')}
              </Button>
              {saveAckAt && (
                <div className="mt-2 text-[12px] text-success">{t('systemSettings.saveSuccess')}</div>
              )}
            </div>
          )}

          {tab === 'security' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('systemSecurity.title')}</h3>
              <div className="space-y-6 max-w-xl">
                <div>
                  <h4 className="text-[13px] font-medium text-foreground mb-3">{t('systemSecurity.passwordPolicy')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={t('systemSecurity.minLength')} value="8" type="number" />
                    <Field label={t('systemSecurity.lockoutDuration')} value="90" type="number" />
                  </div>
                  <div className="flex items-center justify-between bg-card rounded-md p-3 mt-3">
                    <span className="text-[13px] text-foreground">{t('systemSecurity.requireSymbols')}</span>
                    <Toggle checked={security.requireSpecialChars} onChange={() => setSecurity((p) => ({ ...p, requireSpecialChars: !p.requireSpecialChars }))} />
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-foreground mb-3">{t('systemSecurity.login')}</h4>
                  <div className="space-y-3">
                    <Field label={t('systemSecurity.maxAttempts')} value="5" type="number" />
                    <div className="flex items-center justify-between bg-card rounded-md p-3">
                      <div>
                        <div className="text-[13px] text-foreground">{t('systemSecurity.twoFactorForcedLabel')}</div>
                        <div className="text-[11px] text-muted-foreground">{t('systemSecurity.twoFactorAppliesToAll')}</div>
                      </div>
                      <Toggle checked={security.enforce2FA} onChange={() => setSecurity((p) => ({ ...p, enforce2FA: !p.enforce2FA }))} />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-[13px] font-medium text-foreground mb-2">{t('systemSecurity.ipWhitelist')}</h4>
                  <Textarea
                    defaultValue={"192.168.1.0/24\n10.0.0.0/8"}
                    rows={4}
                    className="font-mono resize-none"
                    placeholder={t('systemSecurity.ipWhitelist.placeholder')}
                  />
                </div>
              </div>
              <Button onClick={handleSave} className="mt-6">
                {t('systemSettings.saveChanges')}
              </Button>
              {saveAckAt && (
                <div className="mt-2 text-[12px] text-success">{t('systemSettings.saveSuccess')}</div>
              )}
            </div>
          )}

          {tab === 'email' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('emailSmtp.title')}</h3>
              <div className="space-y-4 max-w-xl">
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t('emailSmtp.smtpHost')} value="smtp.gmail.com" placeholder="smtp.example.com" />
                  <Field label={t('emailSmtp.port')} value="587" type="number" />
                  <Field label={t('emailSmtp.username')} value="noreply@duali.com" />
                  <Field label={t('emailSmtp.password')} value="" type="password" placeholder="••••••••" />
                </div>
                <Field label={t('emailSmtp.fromLabel')} value="Duall Master <noreply@duali.com>" />
                <div className="flex items-center justify-between bg-card rounded-md p-3">
                  <div>
                    <div className="text-[13px] text-foreground">{t('emailSmtp.tlsLabel')}</div>
                    <div className="text-[11px] text-muted-foreground">{t('emailSmtp.tlsDesc')}</div>
                  </div>
                  <Toggle checked={email.tls} onChange={() => setEmail((p) => ({ ...p, tls: !p.tls }))} />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button onClick={handleSave}>
                  {t('systemSettings.saveChanges')}
                </Button>
                <Button variant="outline">
                  {t('emailSmtp.sendTest')}
                </Button>
              </div>
              {saveAckAt && (
                <div className="mt-3 text-[12px] text-success">{t('systemSettings.saveSuccess')}</div>
              )}
            </div>
          )}

          {tab === 'notifications' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('monitoring.alerts')}</h3>
              <div className="space-y-3 max-w-xl">
                {[
                  { key: 'emailAlerts' as const, label: t('monitoring.notifications.email.title'), desc: t('monitoring.notifications.email.desc') },
                  { key: 'pushNotifications' as const, label: t('monitoring.notifications.push.title'), desc: t('monitoring.notifications.push.desc') },
                  { key: 'smsAlerts' as const, label: t('monitoring.notifications.sms.title'), desc: t('monitoring.notifications.sms.desc') },
                  { key: 'criticalOnly' as const, label: t('monitoring.notifications.critical.title'), desc: t('monitoring.notifications.critical.desc') },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between bg-card rounded-md p-3">
                    <div>
                      <div className="text-[13px] text-foreground">{item.label}</div>
                      <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                    </div>
                    <Toggle checked={notifs[item.key]} onChange={() => setNotifs((p) => ({ ...p, [item.key]: !p[item.key] }))} />
                  </div>
                ))}
                <div className="pt-3">
                  <h4 className="text-[13px] font-medium text-foreground mb-3">{t('monitoring.alertThresholds.title')}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={t('monitoring.alertThresholds.temperatureMax')} value="35" type="number" />
                    <Field label={t('monitoring.alertThresholds.doorOpenDuration')} value="5" type="number" />
                    <Field label={t('monitoring.alertThresholds.cameraOfflineDuration')} value="3" type="number" />
                    <Field label={t('monitoring.alertThresholds.wrongLoginStreak')} value="5" type="number" />
                  </div>
                </div>
              </div>
              <Button onClick={handleSave} className="mt-6">
                {t('systemSettings.saveChanges')}
              </Button>
              {saveAckAt && (
                <div className="mt-2 text-[12px] text-success">{t('systemSettings.saveSuccess')}</div>
              )}
            </div>
          )}

          {tab === 'backup' && (
            <div>
              <h3 className="text-[16px] font-semibold text-foreground mb-4">{t('backup.title')}</h3>
              <div className="space-y-4 max-w-xl">
                <div className="flex items-center justify-between bg-card rounded-md p-3">
                  <div>
                    <div className="text-[13px] text-foreground">{t('backup.autoBackup')}</div>
                    <div className="text-[11px] text-muted-foreground">{t('backup.autoBackupDesc')}</div>
                  </div>
                  <Toggle checked={backup.autoBackup} onChange={() => setBackup((p) => ({ ...p, autoBackup: !p.autoBackup }))} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-[12px]">{t('backup.frequency')}</Label>
                    <Select className="mt-1">
                      <SelectOption value="daily">{t('backup.frequency.daily')}</SelectOption>
                      <SelectOption value="weekly">{t('backup.frequency.weekly')}</SelectOption>
                      <SelectOption value="monthly">{t('backup.frequency.monthly')}</SelectOption>
                    </Select>
                  </div>
                  <Field label={t('backup.retention')} value="30" type="number" />
                </div>

                {/* Last backup info */}
                <div className="bg-card rounded-lg p-4 border border-border">
                  <h4 className="text-[13px] font-medium text-foreground mb-3">{t('backup.lastBackup')}</h4>
                  <div className="grid grid-cols-2 gap-y-2 text-[12px]">
                    <span className="text-muted-foreground">{t('backup.lastBackup.time')}:</span>
                    <span className="text-foreground">04/03/2026 04:00</span>
                    <span className="text-muted-foreground">{t('backup.lastBackup.size')}:</span>
                    <span className="text-foreground">2.4 GB</span>
                    <span className="text-muted-foreground">{t('backup.lastBackup.status')}:</span>
                    <span className="text-success font-medium inline-flex items-center gap-1"><Check size={12} /> {t('backup.lastBackup.status.success')}</span>
                    <span className="text-muted-foreground">{t('backup.lastBackup.location')}:</span>
                    <span className="text-foreground">S3 — duall-backup/2026-03-04/</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <Button onClick={handleSave}>
                  {t('systemSettings.saveChanges')}
                </Button>
                <Button variant="outline" className="inline-flex items-center gap-1.5">
                  <HardDrive size={14} /> {t('backup.backupNow')}
                </Button>
              </div>
              {saveAckAt && (
                <div className="mt-3 text-[12px] text-success">{t('systemSettings.saveSuccess')}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
