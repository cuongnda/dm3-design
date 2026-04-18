import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Mail, Shield, Clock, Calendar, Globe,
  KeyRound, Save, EyeOff, Eye, Check, AlertCircle,
} from 'lucide-react';
import { Button, Input, Label } from '@dm3/ui';
import { useAuthStore } from '@/stores/authStore';
import { apiFetch } from '@/lib/api';

interface MeProfile {
  id: string;
  tenant_id?: string;
  email: string;
  name?: string;
  roles?: string[];
  role?: string;
  status: string;
  last_login?: string;
  created_at: string;
  preferred_language?: string;
  timezone?: string;
}

export function ProfilePage() {
  const { t, i18n } = useTranslation('settings');
  const user = useAuthStore((s) => s.user);
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Language
  const [lang, setLang] = useState<'en' | 'vi'>('en');
  const [langSaved, setLangSaved] = useState(false);

  useEffect(() => {
    apiFetch<MeProfile>('/api/v1/auth/me')
      .then((d) => { setProfile(d); setLang((d.preferred_language as 'en' | 'vi') || 'en'); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const fmt = (s?: string) => {
    if (!s) return '—';
    return new Date(s).toLocaleString(i18n.language === 'vi' ? 'vi-VN' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const roleLabel = (r?: string) => r ? r.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : '—';

  const handleChangePw = async () => {
    setPwMsg(null);
    if (!currentPw || !newPw || !confirmPw) { setPwMsg({ ok: false, text: t('security.allFieldsRequired', 'All fields are required') }); return; }
    if (newPw.length < 6) { setPwMsg({ ok: false, text: t('security.passwordMinLength', 'Min 6 characters') }); return; }
    if (newPw !== confirmPw) { setPwMsg({ ok: false, text: t('security.passwordMismatch', 'Passwords do not match') }); return; }
    setPwLoading(true);
    try {
      await apiFetch('/api/v1/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: currentPw, new_password: newPw, confirm_password: confirmPw }),
      });
      setPwMsg({ ok: true, text: t('security.passwordChanged', 'Password changed') });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch {
      setPwMsg({ ok: false, text: t('security.passwordChangeFailed', 'Failed to change password.') });
    } finally { setPwLoading(false); }
  };

  const handleLang = async (l: 'en' | 'vi') => {
    const prev = lang;
    setLang(l); setLangSaved(false);
    try {
      await apiFetch('/api/v1/auth/me', { method: 'PATCH', body: JSON.stringify({ preferred_language: l }) });
      i18n.changeLanguage(l); checkAuth();
      setLangSaved(true); setTimeout(() => setLangSaved(false), 2000);
    } catch { setLang(prev); }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>;
  }

  const name = profile?.name || user?.name || profile?.email || '';
  const initials = user?.initials || name.slice(0, 2).toUpperCase();

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-2xl mx-auto py-8 px-6 space-y-0">

        {/* Profile header */}
        <div className="flex items-center gap-4 pb-6">
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-lg font-bold text-primary-foreground shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">{name}</h1>
            <p className="text-sm text-muted-foreground truncate">{profile?.email}</p>
            {profile?.role && (
              <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                <Shield size={11} /> {roleLabel(profile.role)}
              </span>
            )}
          </div>
        </div>

        {/* Section: Account details */}
        <section className="border-t border-border py-6">
          <h2 className="text-sm font-semibold mb-1">{t('profile.accountInfo', 'Account Information')}</h2>
          <p className="text-xs text-muted-foreground mb-4">{t('profile.accountInfoDesc', 'Your account details and activity.')}</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <InfoRow icon={Mail} label={t('profile.email')} value={profile?.email} />
            <InfoRow icon={Shield} label={t('profile.role', 'Role')} value={roleLabel(profile?.role)} />
            <InfoRow icon={Calendar} label={t('profile.memberSince', 'Member since')} value={fmt(profile?.created_at)} />
            <InfoRow icon={Clock} label={t('profile.lastLogin', 'Last login')} value={fmt(profile?.last_login)} />
          </div>
        </section>

        {/* Section: Language */}
        <section className="border-t border-border py-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Globe size={14} /> {t('appearance.language', 'Language')}
            </h2>
            {langSaved && (
              <span className="text-xs text-emerald-500 flex items-center gap-1">
                <Check size={12} /> {t('profile.saved', 'Saved')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-3">{t('appearance.languageDesc', 'Choose your preferred display language.')}</p>
          <div className="flex gap-2">
            {(['en', 'vi'] as const).map((l) => (
              <button
                key={l}
                onClick={() => handleLang(l)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  lang === l
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                }`}
                data-testid={`settings-button-lang-${l}`}
              >
                {l === 'en' ? 'English' : 'Tiếng Việt'}
              </button>
            ))}
          </div>
        </section>

        {/* Section: Change password */}
        <section className="border-t border-border py-6">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
            <KeyRound size={14} /> {t('security.changePassword', 'Change Password')}
          </h2>
          <p className="text-xs text-muted-foreground mb-4">{t('security.changePasswordDesc', 'Update your password to keep your account secure.')}</p>

          <div className="space-y-3 max-w-md">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{t('security.currentPassword', 'Current password')}</Label>
              <div className="relative">
                <Input
                  className="h-9 text-sm pr-9"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  data-testid="settings-input-currentPassword"
                />
                <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{t('security.newPassword', 'New password')}</Label>
              <div className="relative">
                <Input
                  className="h-9 text-sm pr-9"
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="••••••••"
                  data-testid="settings-input-newPassword"
                />
                <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{t('security.confirmPassword', 'Confirm new password')}</Label>
              <Input
                className="h-9 text-sm"
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="••••••••"
                data-testid="settings-input-confirmPassword"
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button size="sm" onClick={handleChangePw} disabled={pwLoading} data-testid="settings-button-changePassword">
                <Save size={14} className="mr-1.5" /> {t('security.updatePassword', 'Update password')}
              </Button>
              {pwMsg && (
                <span className={`text-xs flex items-center gap-1 ${pwMsg.ok ? 'text-emerald-500' : 'text-destructive'}`}>
                  {pwMsg.ok ? <Check size={12} /> : <AlertCircle size={12} />} {pwMsg.text}
                </span>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-muted-foreground shrink-0 mt-0.5" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value || '—'}</p>
      </div>
    </div>
  );
}
