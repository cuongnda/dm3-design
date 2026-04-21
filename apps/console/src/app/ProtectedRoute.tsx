import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { getToken } from '@/lib/api';
import { toast } from '@/lib/toast';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const { t } = useTranslation('common');

  // Listen for auth-expired events dispatched by apiFetch when token refresh
  // fails. Show a soft toast instead of letting a red error page surface,
  // then let the Zustand state change trigger a SPA redirect on re-render.
  useEffect(() => {
    const handler = () => {
      toast(
        t('auth.sessionExpired', 'Session expired — please sign in again'),
        'warning',
      );
      logout();
    };
    window.addEventListener('dm3:auth-expired', handler);
    return () => window.removeEventListener('dm3:auth-expired', handler);
  }, [logout, t]);

  // Zustand persist with localStorage hydrates synchronously.
  // If somehow there's a token but store hasn't marked user as authenticated
  // (e.g. token set externally), still allow through.
  const hasToken = Boolean(getToken());

  if (!isAuthenticated && !hasToken) {
    // Preserve where the user was so we can bounce back after sign-in.
    const next = location.pathname + location.search;
    const target = next && next !== '/' && !next.startsWith('/login')
      ? `/login?next=${encodeURIComponent(next)}`
      : '/login';
    return <Navigate to={target} replace />;
  }

  return <Outlet />;
}
