export const env = {
  // Mặc định dùng cùng origin (qua reverse proxy/Vite proxy) để tránh CORS/preflight và lệch host khi dev.
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  realtimeUrl: import.meta.env.VITE_REALTIME_URL ?? '',
  /** Bảng điều khiển quản trị nhận phiên qua mã bàn giao dùng một lần. */
  adminUrl: import.meta.env.VITE_ADMIN_URL ?? 'http://localhost:5174',
} as const;

/** Build the SSO destination without introducing duplicate slashes when the
 * configured admin base URL already ends in `/` (as it does in production).
 */
export function adminSsoUrl(code: string): string {
  return `${env.adminUrl.replace(/\/+$/, '')}/sso?code=${encodeURIComponent(code)}`;
}
