import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { clearAdminSession, useAdminSession } from '../../features/auth/session';
import { env } from '../config/env';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard vĩ mô', icon: '📊', end: true },
  { to: '/broadcast', label: 'Thông báo hệ thống', icon: '📢' },
  { to: '/gift-codes', label: 'Mã quà tặng', icon: '🎁' },
  { to: '/calendar-seasons', label: 'Mùa & Lịch nghỉ Công nhân', icon: '🗓️' },
  { to: '/education-config', label: 'Giáo dục & Đại học', icon: '🎓' },
  { to: '/politics', label: 'Chính trị & Bầu cử', icon: '🗳️' },
  { to: '/interest-rates', label: 'Lãi suất vay & Tiết kiệm', icon: '💹' },
  { to: '/industry-revenue', label: 'Doanh thu công ty (30 ngày)', icon: '🏭' },
  { to: '/stock-market-control', label: 'Điều chỉnh chứng khoán', icon: '📈' },
  { to: '/offline', label: 'Cấu hình Offline', icon: '🌙' },
  { to: '/restriction', label: 'Bảo trì & Hạn chế', icon: '🛠️' },
  { to: '/map-editor', label: 'Map Editor', icon: '🗺️' },
  { to: '/players', label: 'Người chơi', icon: '👥' },
  { to: '/ai-events', label: 'AI & Sự kiện', icon: '🤖' },
  { to: '/audit-logs', label: 'Nhật ký Audit Log', icon: '📜' },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Quản trị viên',
  moderator: 'Điều hành viên',
  player: 'Công dân',
};

export function AdminLayout() {
  const session = useAdminSession();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function handleLogout() {
    clearAdminSession();
    window.location.assign(`${env.portalUrl}/login`);
  }

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-surface-50 font-sans text-slate-900">
      {menuOpen && (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-base">
              🛠️
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                EFLS Admin
              </p>
              <p className="text-sm font-medium text-slate-800">Control Panel</p>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between px-2 lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Menu</span>
          <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Đóng</button>
        </div>

        <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto [scrollbar-width:thin] lg:mt-6">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900',
                  isActive && 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
                )
              }
            >
              <span aria-hidden className="text-base leading-none">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-2 rounded-2xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-500">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-slate-800">
              {session?.user.username ?? 'Quản trị viên'}
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {ROLE_LABEL[session?.user.role ?? 'admin'] ?? 'ADMIN'}
            </span>
          </div>
          <p className="truncate text-[11px]" title={session?.user.email}>
            {session?.user.email}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex w-full flex-shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-5 lg:py-0">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Mở menu"
            >
              <span className="text-lg leading-none">☰</span>
            </button>
            <span className="truncate text-xs font-medium text-slate-600 sm:text-sm">Bảng Điều Khiển Quản Trị</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline">
              JWT đã xác thực
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              ADMIN
            </span>
          </div>
        </header>
        <main className="w-full flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
