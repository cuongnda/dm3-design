import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';
import { RealtimeProvider } from './RealtimeProvider';
import { useAuthStore } from '@/stores/authStore';

function AppInner() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* RealtimeProvider mounts only when authenticated — auto-connects WS on mount, disconnects on unmount */}
      {isAuthenticated && <RealtimeProvider />}
      <RouterProvider router={router} />
    </>
  );
}

export function App() {
  return (
    <Providers>
      <AppInner />
    </Providers>
  );
}
