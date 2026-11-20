import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { DialogProvider } from '../shared/ui/DialogContext';

/**
 * Chỉ retry lỗi tạm thời (mạng, 429, 5xx). Lỗi 4xx nghiệp vụ (401/403/404/400)
 * không nên lặp vì vừa vô ích vừa có thể khuếch đại tải lên máy chủ.
 */
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
      staleTime: 15_000,
      retry: retryTransient,
      // Khi mạng/socket hồi phục, tự làm mới dữ liệu thay vì để UI cũ.
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      networkMode: 'online',
    },
    mutations: {
      // Không tự retry mutation để tránh giao dịch trùng (đã có Idempotency-Key).
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
