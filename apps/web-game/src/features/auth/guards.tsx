import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { SsoHandoffResponseSchema, TokenPairSchema } from '@efls/contracts';
import { apiRequest } from '../../shared/api/httpClient';
import { adminSsoUrl } from '../../shared/config/env';
import { useSessionStore } from './sessionStore';

/**
 * Chặn mọi route riêng tư khi chưa có phiên đăng nhập hợp lệ.
 * Token được server xác thực ở mỗi request; đây chỉ là lớp bảo vệ điều hướng.
 */
export function RequireAuth() {
  const accessToken = useSessionStore((state) => state.accessToken);
  const user = useSessionStore((state) => state.user);
  const location = useLocation();

  if (!accessToken || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * Đã đăng nhập thì không cần vào lại cổng đăng nhập — trừ trường hợp người
 * chơi đang đăng nhập mà mở cổng với `?next=admin`: khi đó vẫn cho phép đăng
 * nhập bằng tài khoản quản trị khác.
 */
export function RedirectIfAuthenticated({ children }: { children: React.ReactNode }) {
  const accessToken = useSessionStore((state) => state.accessToken);
  const user = useSessionStore((state) => state.user);
  const [searchParams] = useSearchParams();

  const staffDestination = searchParams.get('next') === 'admin';
  const isStaff = user?.role === 'admin' || user?.role === 'moderator';
  const allowSwitchAccount = accessToken !== null && staffDestination && !isStaff;
  const [handoffError, setHandoffError] = useState(false);
  const handoffStarted = useRef(false);

  useEffect(() => {
    if (!accessToken || !staffDestination || !isStaff || handoffStarted.current) return;
    handoffStarted.current = true;
    void (async () => {
      try {
        const currentRefreshToken = useSessionStore.getState().refreshToken;
        if (!currentRefreshToken) throw new Error('Missing refresh token');
        // Rotate first so the handoff never receives a stale refresh token if
        // apiRequest has to renew an expired access token.
        const refreshed = TokenPairSchema.safeParse(await apiRequest<unknown>('/api/v1/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
        }));
        if (!refreshed.success) throw new Error('Unable to refresh session');
        useSessionStore.getState().setSession(refreshed.data);
        const response = await apiRequest<unknown>('/api/v1/auth/sso/handoff', {
          method: 'POST',
          body: JSON.stringify({ refreshToken: refreshed.data.refreshToken }),
        });
        const handoff = SsoHandoffResponseSchema.safeParse(response);
        if (!handoff.success) throw new Error('Invalid SSO handoff');
        window.location.assign(adminSsoUrl(handoff.data.code));
      } catch {
        setHandoffError(true);
      }
    })();
  }, [accessToken, isStaff, staffDestination]);

  if (accessToken && !allowSwitchAccount) {
    if (staffDestination && isStaff) {
      if (!handoffError) return null;
      return <div className="p-6 text-center">Không thể chuyển phiên sang trang quản trị. Vui lòng tải lại trang để thử lại.</div>;
    }
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
