import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { getToken } from '@/lib/api';

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Zustand persist with localStorage hydrates synchronously.
  // If somehow there's a token but store hasn't marked user as authenticated
  // (e.g. token set externally), still allow through.
  const hasToken = Boolean(getToken());

  if (!isAuthenticated && !hasToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
