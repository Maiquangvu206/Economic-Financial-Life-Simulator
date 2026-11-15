import clsx from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';
import { clearAdminSession, useAdminSession } from '../../features/auth/session';
import { env } from '../config/env';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard vĩ mô', icon: '📊', end: true },
  { to: '/broadcast', label: 'Thông báo hệ thống', icon: '📢' },
  { to: '/gift-codes', label: 'Mã quà tặng', icon: '🎁' },
  { to: '/calendar-seasons', label: 'Mùa & Lịch nghỉ Công nhân', icon: '🗓️' },
  { to: '/education-config', label: 'Giáo dục & Đại học', icon: '🎓' },
  { to: '/politics', label: 'Chính trị & Bầu cử', icon: '🗳️' },
  { to: '/offline', label: 'Cấu hình Offline', icon: '🌙' },
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

  function handleLogout() {
    clearAdminSession();
    window.location.assign(`${env.portalUrl}/login`);
  }

  return (
    // Root: cao đúng 100vh, ẩn thanh cuộn cửa sổ chính
    <div className="flex h-screen w-screen overflow-hidden bg-surface-50 font-sans text-slate-900">
      {/* Sidebar cố định bên trái */}
      <aside className="w-64 h-full flex-shrink-0 flex flex-col border-r border-slate-200 bg-white px-3 py-4">
        <div className="px-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-base">
              🛠️
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-600">
                EFLS Admin
              </p>
              <p className="text-sm font-medium text-slate-800">Control Panel</p>
            </div>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto [scrollbar-width:thin]">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900',
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
          <div className="flex items-center justify-between">
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

      {/* Vùng phải: Topbar trên + Main Content dưới */}
      <div className="flex-1 h-full min-w-0 flex flex-col overflow-hidden">
        {/* Topbar cố định */}
        <header className="h-16 w-full flex-shrink-0 flex items-center justify-between border-b border-slate-200 bg-white px-5">
          <span className="text-xs font-medium text-slate-600">Bảng Điều Khiển Quản Trị</span>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 sm:inline">
              JWT đã xác thực
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              ADMIN
            </span>
          </div>
        </header>
        {/* Main Content: chỉ vùng này tự cuộn khi trang dài */}
        <main className="flex-1 w-full overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
