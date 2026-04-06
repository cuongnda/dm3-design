import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useAuthStore } from '@/stores/authStore';
import { getToken } from '@/lib/api';

export function MainLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated && !getToken()) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
