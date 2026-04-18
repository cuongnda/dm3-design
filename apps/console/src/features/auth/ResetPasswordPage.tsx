import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, EyeOff, CheckCircle, ShieldAlert } from 'lucide-react';
import { Button, Input, LanguageSwitcher } from '@dm3/ui';

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError(t('reset.passwordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('reset.passwordMismatch'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          new_password: password,
          confirm_password: confirm,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'error');
      }
      setSuccess(true);
    } catch {
      setError(t('reset.error'));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-[400px] text-center space-y-4">
          <div className="w-16 h-16 mx-auto bg-error/10 border border-error/30 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-error" />
          </div>
          <h2 className="text-[16px] font-semibold text-foreground">{t('reset.invalidLink')}</h2>
          <p className="text-[13px] text-muted-foreground">{t('reset.invalidLinkDescription')}</p>
          <Link
            to="/forgot-password"
            className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:text-primary/80"
          >
            {t('reset.requestNew')}
          </Link>
        </div>
      </div>
    );
  }

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

        {success ? (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-success/10 border border-success/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-[16px] font-semibold text-foreground">{t('reset.success')}</h2>
            <p className="text-[13px] text-muted-foreground">{t('reset.successDescription')}</p>
            <Link
              to="/login"
              className="inline-block mt-2"
            >
              <Button className="w-full">{t('signIn')}</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center mb-6">
              <h2 className="text-[16px] font-semibold text-foreground">{t('reset.title')}</h2>
              <p className="text-[13px] text-muted-foreground mt-1">{t('reset.description')}</p>
            </div>

            {error && (
              <div className="px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px]">
                {error}
              </div>
            )}

            <div className="relative">
              <Input
                data-testid="reset-input-password"
                type={showPass ? 'text' : 'password'}
                placeholder={t('reset.newPassword')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <Input
              data-testid="reset-input-confirm"
              type={showPass ? 'text' : 'password'}
              placeholder={t('reset.confirmPassword')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={6}
            />

            <Button
              data-testid="reset-button-submit"
              type="submit"
              disabled={loading || !password || !confirm}
              className="w-full"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('reset.resetting')}
                </span>
              ) : (
                t('reset.submit')
              )}
            </Button>

            <div className="text-center mt-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={14} />
                {t('backToLogin')}
              </Link>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-10 flex items-center justify-between text-[12px] text-muted-foreground border-t border-border pt-4">
          <span>Building: Landmark 81 ▾</span>
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
