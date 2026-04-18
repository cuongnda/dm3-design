import { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getToken } from '@/lib/api';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const logout = useAuthStore((s) => s.logout);

  // Listen for auth-expired events dispatched by apiFetch when token refresh
  // fails. This triggers a Zustand state change which causes ProtectedRoute to
  // re-render and redirect via the SPA router — no hard page reload needed.
  useEffect(() => {
    const handler = () => logout();
    window.addEventListener('dm3:auth-expired', handler);
    return () => window.removeEventListener('dm3:auth-expired', handler);
  }, [logout]);

  // Zustand persist with localStorage hydrates synchronously.
  // If somehow there's a token but store hasn't marked user as authenticated
  // (e.g. token set externally), still allow through.
  const hasToken = Boolean(getToken());

  if (!isAuthenticated && !hasToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
