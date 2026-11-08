export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  /** Cổng đăng nhập duy nhất của hệ thống (ứng dụng người chơi). */
  portalUrl: import.meta.env.VITE_PORTAL_URL ?? 'http://localhost:5173',
} as const;
