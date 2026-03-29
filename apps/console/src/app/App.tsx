import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { router } from './router';
import { useAuthStore } from '@/stores/authStore';

function AppInner() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <Providers>
      <AppInner />
    </Providers>
  );
}
