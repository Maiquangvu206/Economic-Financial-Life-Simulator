export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  realtimeUrl: import.meta.env.VITE_REALTIME_URL ?? 'http://localhost:5000',
  /** Bảng điều khiển quản trị nhận phiên qua mã bàn giao dùng một lần. */
  adminUrl: import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174',
} as const;
