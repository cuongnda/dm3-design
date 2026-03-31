import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { login as apiLogin, loginStep2, setToken } from '@/lib/api';
import type { LoginCompany, LoginUser } from '@/lib/api';
import { Eye, EyeOff, Building2, ChevronRight } from 'lucide-react';
import { LanguageSwitcher } from '@dm3/ui';

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

  const completeLogin = (accessToken: string, refreshToken: string, userInfo: LoginUser) => {
    setToken(accessToken, refreshToken);
    const role = userInfo.role || 'user';
    login({
      id: userInfo.id,
      name: userInfo.name || userInfo.email.split('@')[0],
      email: userInfo.email,
      role,
      initials: (userInfo.name || userInfo.email).slice(0, 2).toUpperCase(),
    });
    navigate(role === 'system_admin' ? '/system' : '/');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await apiLogin(email, password);

      if (res.step === 'complete' && res.access_token && res.refresh_token && res.user) {
        completeLogin(res.access_token, res.refresh_token, res.user);
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
      if (res.step === 'complete' && res.access_token && res.refresh_token && res.user) {
        completeLogin(res.access_token, res.refresh_token, res.user);
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
      primary_manager: 'bg-[#7C3AED]/20 text-[#A78BFA] border-[#7C3AED]/30',
      manager: 'bg-[#2563EB]/20 text-[#60A5FA] border-[#2563EB]/30',
      operator: 'bg-[#059669]/20 text-[#34D399] border-[#059669]/30',
      viewer: 'bg-[#64748B]/20 text-[#94A3B8] border-[#64748B]/30',
      admin: 'bg-[#DC2626]/20 text-[#F87171] border-[#DC2626]/30',
    };
    return colors[role] || colors.viewer;
  };

  return (
    <div className="min-h-screen bg-[#0A0E1A] flex items-center justify-center px-4">
      <div className="w-full max-w-[400px]">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-[#3B82F6] rotate-45 rounded-[6px]" />
          </div>
          <h1 className="text-[20px] font-semibold text-[#F8FAFC] tracking-tight">DUALL MASTER 3.0</h1>
          <p className="text-[13px] text-[#64748B] mt-1">{t('buildingOperatingSystem')}</p>
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
              <div className="px-3 py-2 bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-md text-[#EF4444] text-[13px]">
                {error}
              </div>
            )}
            <div>
              <input
                data-testid="login-input-email"
                type="email"
                placeholder={t('email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-9 px-3 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20"
              />
            </div>
            <div className="relative">
              <input
                data-testid="login-input-password"
                type={showPass ? 'text' : 'password'}
                placeholder={t('password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 pr-10 bg-[#111827] border border-[#334155] rounded-md text-[#F8FAFC] text-[13px] placeholder:text-[#64748B] focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]/20"
              />
              <button
                data-testid="login-button-show-password"
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8]"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <label className="flex items-center gap-2 text-[12px] text-[#94A3B8]">
              <input type="checkbox" className="rounded border-[#334155]" />
              {t('rememberDevice')}
            </label>

            <button
              data-testid="login-button-submit"
              type="submit"
              disabled={loading}
              className="w-full h-9 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-md text-[14px] font-medium transition-colors disabled:opacity-60"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('signingIn')}
                </span>
              ) : (
                t('signIn')
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#334155]" />
              </div>
              <div className="relative flex justify-center text-[12px]">
                <span className="bg-[#0A0E1A] px-3 text-[#64748B]">{t('orContinueWith')}</span>
              </div>
            </div>

            <button
              type="button"
              className="w-full h-9 bg-[#1E293B] hover:bg-[#334155] border border-[#334155] text-[#F8FAFC] rounded-md text-[13px] font-medium transition-colors"
            >
              {t('signInWithSSO')}
            </button>

            <div className="text-center mt-4">
              <a href="#" className="text-[12px] text-[#3B82F6] hover:underline">
                {t('forgotPassword')}
              </a>
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
              <div className="w-12 h-12 mx-auto mb-3 bg-[#1E293B] border border-[#334155] rounded-full flex items-center justify-center text-[#F8FAFC] text-[16px] font-semibold">
                {(user.name || user.email).slice(0, 2).toUpperCase()}
              </div>
              <p className="text-[14px] text-[#F8FAFC]">
                {t('loggingInAs')} <span className="font-medium">{user.name || user.email}</span>
              </p>
              <p className="text-[12px] text-[#64748B] mt-1">{t('selectCompany')}</p>
            </div>
          )}

          {error && step === 'select_company' && (
            <div className="px-3 py-2 mb-4 bg-[#7F1D1D]/20 border border-[#EF4444]/30 rounded-md text-[#EF4444] text-[13px]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            {companies.map((company) => (
              <button
                data-testid={`login-button-company-${company.id}`}
                key={company.id}
                onClick={() => handleSelectCompany(company.id)}
                disabled={selectingId !== null}
                className="w-full flex items-center gap-3 p-3 bg-[#111827] hover:bg-[#1E293B] border border-[#334155] hover:border-[#3B82F6]/50 rounded-lg transition-all text-left group disabled:opacity-60"
              >
                <div className="w-10 h-10 bg-[#1E293B] group-hover:bg-[#334155] border border-[#334155] rounded-lg flex items-center justify-center shrink-0 transition-colors">
                  {company.logo_url ? (
                    <img src={company.logo_url} alt="" className="w-6 h-6 rounded" />
                  ) : (
                    <Building2 size={18} className="text-[#64748B]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#F8FAFC] truncate">{company.name}</p>
                  <span
                    className={`inline-block mt-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${roleBadgeColor(company.role)}`}
                  >
                    {roleLabel(company.role)}
                  </span>
                </div>
                {selectingId === company.id ? (
                  <span className="w-4 h-4 border-2 border-[#3B82F6]/30 border-t-[#3B82F6] rounded-full animate-spin shrink-0" />
                ) : (
                  <ChevronRight size={16} className="text-[#64748B] group-hover:text-[#94A3B8] shrink-0" />
                )}
              </button>
            ))}
          </div>

          <button
            onClick={handleBack}
            className="w-full mt-4 text-[12px] text-[#64748B] hover:text-[#94A3B8] transition-colors"
          >
            {t('backToLogin')}
          </button>
        </div>

        {/* Footer */}
        <div className="mt-10 flex items-center justify-between text-[12px] text-[#64748B] border-t border-[#1E293B] pt-4">
          <span>Building: Landmark 81 ▾</span>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
