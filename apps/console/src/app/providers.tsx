import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@dm3/ui';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        {children}
      </TooltipProvider>
    </QueryClientProvider>
  );
}
