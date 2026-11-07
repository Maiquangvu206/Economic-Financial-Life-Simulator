import clsx from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard vĩ mô', end: true },
  { to: '/broadcast', label: 'Thông báo hệ thống' },
  { to: '/calendar-seasons', label: 'Mùa & Lịch nghỉ Công nhân' },
  { to: '/map-editor', label: 'Map Editor' },
  { to: '/players', label: 'Người chơi' },
  { to: '/ai-events', label: 'AI & Sự kiện' },
  { to: '/audit-logs', label: 'Nhật ký Audit Log' },
];

export function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-800 bg-surface-900/70 px-3 py-4">
        <div className="px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
            EFLS Admin
          </p>
          <p className="mt-1 text-sm font-medium text-slate-200">Control Panel</p>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-100',
                  isActive && 'bg-amber-950/50 text-amber-300 ring-1 ring-inset ring-amber-900',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b border-slate-800 px-5">
          <span className="text-xs text-slate-400 font-medium">Bảng Điều Khiển Quản Trị</span>
          <span className="rounded-full border border-amber-900 bg-amber-950/40 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
            ADMIN
          </span>
        </header>
        <main className="p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
