import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@dm3/ui';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import i18n from '@/i18n';
import { useThemeStore } from '@/stores/themeStore';
import { TenantProvider } from '@/components/tenant';
import { ToastContainer } from '@/components/ToastContainer';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const isLight = theme === 'light';
    // .light overrides CSS variables; .dark is required for Tailwind @custom-variant dark (&:is(.dark *))
    root.classList.toggle('light', isLight);
    root.classList.toggle('dark', !isLight);
  }, [theme]);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <TenantProvider>
            {children}
            <ToastContainer />
          </TenantProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}
