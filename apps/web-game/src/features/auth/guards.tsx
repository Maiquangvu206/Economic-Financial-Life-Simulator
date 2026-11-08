import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
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

  if (accessToken && !allowSwitchAccount) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
