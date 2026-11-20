import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DialogProvider } from '../shared/ui/DialogContext';

/** Chỉ retry lỗi tạm thời (mạng, 429, 5xx) — không lặp lỗi nghiệp vụ 4xx. */
export function retryTransient(failureCount: number, error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (typeof status === 'number') {
    if (status === 0 || status === 408 || status === 429 || status >= 500) {
      return failureCount < 2;
    }
    return false;
  }
  return failureCount < 2;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: retryTransient,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
      networkMode: 'online',
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DialogProvider>{children}</DialogProvider>
    </QueryClientProvider>
  );
}
