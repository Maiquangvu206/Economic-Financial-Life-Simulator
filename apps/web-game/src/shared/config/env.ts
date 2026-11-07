export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000',
  realtimeUrl: import.meta.env.VITE_REALTIME_URL ?? 'http://localhost:5000',
} as const;
