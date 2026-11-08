import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { clearAdminSession, hasAdminAccess, useAdminSession } from './session';
import { env } from '../../shared/config/env';

function portalLoginUrl(): string {
  return `${env.portalUrl}/login?next=admin`;
}

/** Chưa có phiên quản trị: quay về cổng đăng nhập duy nhất của hệ thống. */
function RedirectToPortal() {
  useEffect(() => {
    window.location.replace(portalLoginUrl());
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-slate-600">Đang chuyển đến cổng đăng nhập…</p>
    </div>
  );
}

export function RequireAdmin() {
  const session = useAdminSession();

  if (!session) {
    return <RedirectToPortal />;
  }

  if (!hasAdminAccess(session.user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-2xl">
            ⛔
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Không đủ quyền truy cập</h1>
          <p className="mt-2 text-sm text-slate-600">
            Tài khoản <b>{session.user.email}</b> có vai trò <b>{session.user.role}</b>, không được
            phép vào bảng điều khiển quản trị.
          </p>
          <a
            href={portalLoginUrl()}
            onClick={() => clearAdminSession()}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Đăng nhập bằng tài khoản khác
          </a>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
