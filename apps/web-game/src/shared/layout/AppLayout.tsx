import clsx from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStore } from '../../features/auth/sessionStore';
import { formatMoney } from '../lib/format';

const NAV_ITEMS = [
  { to: '/', label: 'Thành phố', symbol: '▦', end: true },
  { to: '/finance', label: 'Tài chính', symbol: '◈' },
  { to: '/real-estate', label: 'Bất động sản', symbol: '⌂' },
  { to: '/business', label: 'Doanh nghiệp', symbol: '◇' },
  { to: '/stocks', label: 'Chứng khoán', symbol: '↗' },
  { to: '/law', label: 'Pháp lý', symbol: '§' },
  { to: '/underworld', label: 'Chợ đen', symbol: '☠' },
  { to: '/recap', label: 'Offline Recap', symbol: '◷' },
];

export function AppLayout() {
  const user = useSessionStore((state) => state.user);

  return (
    <div className="flex min-h-screen bg-surface-950">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-surface-900/70 px-3 py-4 lg:flex">
        <div className="px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">EFLS</p>
          <p className="mt-1 text-sm font-medium text-slate-200">Economic Life Simulator</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Server-authoritative · Tick 1 ngày = 1 năm
          </p>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => clsx('nav-link', isActive && 'nav-link-active')}
            >
              <span aria-hidden className="w-4 text-center text-base leading-none">
                {item.symbol}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="rounded-lg border border-slate-800 bg-surface-850/80 p-3 text-xs text-slate-400">
          <p className="font-medium text-slate-200">{user?.username ?? 'Khách'}</p>
          <p className="mt-0.5 truncate text-slate-500">{user?.email ?? 'Chưa đăng nhập'}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-surface-900/60 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="rounded-md bg-emerald-950 px-2 py-1 text-[11px] font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-900">
              Năm 1
            </span>
            <span className="text-xs text-slate-500">Thành phố trung tâm</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="text-slate-400">
              Tài sản ròng{' '}
              <span className="font-mono text-sm text-emerald-300">{formatMoney(0)}</span>
            </span>
            <span className="text-slate-400">
              Heat <span className="font-mono text-sm text-amber-300">0</span>
            </span>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
