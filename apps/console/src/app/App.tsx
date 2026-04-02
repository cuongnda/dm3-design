import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';
import { RealtimeProvider } from './RealtimeProvider';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';

function AppInner() {
  const checkAuth = useAuthStore((s) => s.checkAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { i18n } = useTranslation();

  useEffect(() => {
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* RealtimeProvider mounts only when authenticated — auto-connects WS on mount, disconnects on unmount */}
      {isAuthenticated && <RealtimeProvider />}
      {/* Force a full rerender on language switch so all namespaces update consistently */}
      <RouterProvider key={i18n.language} router={router} />
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
