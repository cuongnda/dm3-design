import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { login as apiLogin, loginStep2, setToken } from '@/lib/api';
import type { LoginCompany, LoginUser } from '@/lib/api';
import { Eye, EyeOff, Building2, ChevronRight } from 'lucide-react';
import { LanguageSwitcher, Button, Input } from '@dm3/ui';

type LoginStep = 'credentials' | 'select_company';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('admin@duali.com');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<LoginStep>('credentials');
  const [tempToken, setTempToken] = useState('');
  const [companies, setCompanies] = useState<LoginCompany[]>([]);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const completeLogin = (accessToken: string, refreshToken: string, userInfo: LoginUser, enabledPlugins: string[] = []) => {
    setToken(accessToken, refreshToken);
    const role = userInfo.role || 'user';
    // Ensure isAuthenticated transitions false→true so TenantProvider re-fetches.
    // logout() only resets zustand state without touching localStorage tokens.
    useAuthStore.setState({ user: null, isAuthenticated: false });
    login({
      id: userInfo.id,
      name: userInfo.name || userInfo.email.split('@')[0],
      email: userInfo.email,
      role,
      initials: (userInfo.name || userInfo.email).slice(0, 2).toUpperCase(),
    }, enabledPlugins);
    // Honour `?next=` from ProtectedRoute so users return to where they were
    // bounced from. Guard against open-redirect by accepting only same-origin
    // path-relative values.
    const rawNext = searchParams.get('next');
    const nextIsSafe = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/login');
    const fallback = role === 'system_admin' ? '/system' : '/';
    navigate(nextIsSafe ? rawNext! : fallback);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin(email, password);

      if (res.step === 'complete' && res.access_token && res.user) {
        completeLogin(res.access_token, res.refresh_token ?? '', res.user, res.enabled_plugins ?? []);
      } else if (res.step === 'select_company' && res.temporary_token && res.companies) {
        setTempToken(res.temporary_token);
        setCompanies(res.companies);
        setUser(res.user || null);
        setStep('select_company');
      }
    } catch {
      setError(t('error.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = async (companyId: string) => {
    setSelectingId(companyId);
    setError('');
    try {
      const res = await loginStep2(tempToken, companyId);
      if (res.step === 'complete' && res.access_token && res.user) {
        completeLogin(res.access_token, res.refresh_token ?? '', res.user, res.enabled_plugins ?? []);
      }
    } catch {
      setError(t('error.failedSelectCompany'));
      setSelectingId(null);
    }
  };

  const handleBack = () => {
    setStep('credentials');
    setTempToken('');
    setCompanies([]);
    setUser(null);
    setError('');
  };

  const roleLabel = (role: string) => {
    const keys: Record<string, string> = {
      primary_manager: 'roles.primaryManager',
      manager: 'roles.manager',
      operator: 'roles.operator',
      viewer: 'roles.viewer',
      admin: 'roles.admin',
    };
    return keys[role] ? t(keys[role]) : role;
  };

  const roleBadgeColor = (role: string) => {
    const colors: Record<string, string> = {
      primary_manager: 'bg-manage/20 text-manage border-manage/30',
      manager: 'bg-secure/20 text-secure border-secure/30',
      operator: 'bg-success/20 text-success border-success/30',
      viewer: 'bg-muted text-muted-foreground border-border',
      admin: 'bg-error/20 text-error border-error/30',
    };
    return colors[role] || colors.viewer;
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-3">
            <img src="/logo.png" alt="Duall Master" className="w-16 h-16" />
          </div>
          <h1 className="text-[20px] font-semibold text-foreground tracking-tight">DUALL MASTER 3.0</h1>
          <p className="text-[13px] text-muted-foreground mt-1">{t('buildingOperatingSystem')}</p>
        </div>

        {/* Step 1: Credentials */}
        <div
          className={`transition-all duration-300 ${
            step === 'credentials'
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-4 absolute pointer-events-none'
          }`}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && step === 'credentials' && (
              <div className="px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px]">
                {error}
              </div>
            )}
            <div>
              <Input
                data-testid="login-input-email"
                type="email"
                placeholder={t('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="relative">
              <Input
                data-testid="login-input-password"
                type={showPass ? 'text' : 'password'}
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                data-testid="login-button-show-password"
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer">
              <input type="checkbox" className="rounded border-border" />
              {t('rememberDevice')}
            </label>

            <Button
              data-testid="login-button-submit"
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('signingIn')}
                </span>
              ) : (
                t('signIn')
              )}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-[12px]">
                <span className="bg-background px-3 text-muted-foreground">{t('orContinueWith')}</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full inline-flex items-center justify-center gap-2">
              <Building2 size={14} /> {t('signInWithSSO')}
            </Button>

            <div className="text-center mt-4">
              <Link to="/forgot-password" className="text-[12px] text-primary hover:underline">
                {t('forgotPassword')}
              </Link>
            </div>
          </form>
        </div>

        {/* Step 2: Company Selector */}
        <div
          className={`transition-all duration-300 ${
            step === 'select_company'
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-4 absolute pointer-events-none'
          }`}
        >
          {user && (
            <div className="text-center mb-6">
              <div className="w-12 h-12 mx-auto mb-3 bg-card border border-border rounded-full flex items-center justify-center text-foreground text-[16px] font-semibold">
                {(user.name || user.email).slice(0, 2).toUpperCase()}
              </div>
              <p className="text-[14px] text-foreground">
                {t('loggingInAs')} <span className="font-medium">{user.name || user.email}</span>
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">{t('selectCompany')}</p>
            </div>
          )}

          {error && step === 'select_company' && (
            <div className="px-3 py-2 mb-4 bg-error/10 border border-error/30 rounded-md text-error text-[13px]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {companies.map((company) => (
              <button
                data-testid={`login-button-company-${company.id}`}
                key={company.id}
                type="button"
                onClick={() => handleSelectCompany(company.id)}
                disabled={selectingId !== null}
                className="w-full flex items-center gap-3 p-3 bg-card hover:bg-muted border border-border hover:border-secure/50 rounded-lg transition-all text-left group disabled:opacity-60 cursor-pointer"
              >
                <div className="w-10 h-10 bg-muted border border-border rounded-lg flex items-center justify-center shrink-0 transition-colors">
                  {company.logo_url ? (
                    <img src={company.logo_url} alt="" className="w-6 h-6 rounded" />
                  ) : (
                    <Building2 size={18} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-foreground truncate">{company.name}</p>
                  <span
                    className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${roleBadgeColor(company.role)}`}
                  >
                    {roleLabel(company.role)}
                  </span>
                </div>
                {selectingId === company.id ? (
                  <span className="w-4 h-4 border-2 border-secure/30 border-t-secure rounded-full animate-spin shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground shrink-0" />
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="w-full mt-4 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('backToLogin')}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-10 flex items-center justify-between text-[12px] text-muted-foreground border-t border-border pt-4">
          <span>Building: Landmark 81 ▾</span>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
