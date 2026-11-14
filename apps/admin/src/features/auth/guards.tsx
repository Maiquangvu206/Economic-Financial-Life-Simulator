import { Link, Outlet } from 'react-router-dom';
import { clearAdminSession, hasAdminAccess, useAdminSession } from './session';
import { env } from '../../shared/config/env';

function portalLoginUrl(): string {
  return `${env.portalUrl}/login?next=admin`;
}

export function RequireAdmin() {
  const session = useAdminSession();

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xl text-indigo-600">
            🔒
          </div>
          <h2 className="mt-3 text-base font-bold text-slate-800">Yêu cầu đăng nhập</h2>
          <p className="mt-1 text-xs text-slate-500">
            Bạn cần đăng nhập bằng tài khoản Quản trị viên để truy cập bảng điều khiển.
          </p>
          <div className="mt-5 space-y-2">
            <Link
              to="/login"
              className="block w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              Đăng nhập trực tiếp (Admin Portal)
            </Link>
            <a
              href={portalLoginUrl()}
              className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Đăng nhập qua Cổng thống nhất (SSO)
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess(session.user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
            ⛔
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Không đủ quyền truy cập</h1>
          <p className="mt-2 text-xs text-slate-600 leading-relaxed">
            Tài khoản <b>{session.user.email}</b> có vai trò <b>{session.user.role}</b>, không được
            phép vào bảng điều khiển quản trị.
          </p>
          <div className="mt-6 space-y-2">
            <Link
              to="/login"
              onClick={() => clearAdminSession()}
              className="block w-full rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
            >
              Đăng nhập tài khoản Admin khác
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
