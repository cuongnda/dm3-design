import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Mail, CheckCircle } from 'lucide-react';
import { Button, Input, LanguageSwitcher } from '@dm3/ui';

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError(t('forgot.error'));
    } finally {
      setLoading(false);
    }
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

        {sent ? (
          /* Success state */
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-success/10 border border-success/30 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-[16px] font-semibold text-foreground">{t('forgot.checkEmail')}</h2>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              {t('forgot.sentDescription', { email })}
            </p>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[13px] text-primary hover:text-primary/80 transition-colors mt-4"
            >
              <ArrowLeft size={14} />
              {t('backToLogin')}
            </Link>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center mb-6">
              <div className="w-14 h-14 mx-auto mb-3 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h2 className="text-[16px] font-semibold text-foreground">{t('forgot.title')}</h2>
              <p className="text-[13px] text-muted-foreground mt-1">{t('forgot.description')}</p>
            </div>

            {error && (
              <div className="px-3 py-2 bg-error/10 border border-error/30 rounded-md text-error text-[13px]">
                {error}
              </div>
            )}

            <Input
              data-testid="forgot-input-email"
              type="email"
              placeholder={t('email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <Button
              data-testid="forgot-button-submit"
              type="submit"
              disabled={loading || !email}
              className="w-full"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t('forgot.sending')}
                </span>
              ) : (
                t('forgot.submit')
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
