import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export function RoleBasedRoute() {
  const user = useAuthStore((s) => s.user);

  // If user is system admin, redirect root "/" to system dashboard
  if (user?.role === 'system_admin') {
    return <Navigate to="/system" replace />;
  }

  // For company users, show main layout
  return <Outlet />;
}

export function SystemAdminRoute() {
  const user = useAuthStore((s) => s.user);
  if (user && user.role !== 'system_admin') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}