import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider, ToastProvider } from '@dm3/ui';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import i18n from '@/i18n';
import { useThemeStore } from '@/stores/themeStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('light', theme === 'light');
  }, [theme]);

  return (
    <I18nextProvider i18n={i18n}>
      <ToastProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={200}>
            {children}
          </TooltipProvider>
        </QueryClientProvider>
      </ToastProvider>
    </I18nextProvider>
  );
}
