import { clsx } from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStore } from '../../features/auth/sessionStore';
import { useGameStore } from '../../store/game';
import { formatMoney } from '../lib/format';
import { Badge } from '../ui/Badge';
import { GameButton } from '../ui/GameButton';

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
  const { netWorth, heatLevel, energy, year, day } = useGameStore();

  return (
    <div className="flex min-h-screen bg-surface-950 text-slate-100">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-surface-900/80 px-4 py-6 backdrop-blur-lg lg:flex">
        <div className="px-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-xs font-heading font-bold uppercase tracking-[0.2em] text-emerald-400">
              EFLS
            </p>
          </div>
          <p className="text-sm font-medium text-slate-200">Economic Life Simulator</p>
          <p className="mt-1 text-[10px] text-slate-500">
            Server-authoritative · Tick 1 ngày = 1 năm
          </p>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
                  isActive
                    ? 'bg-emerald-950/40 text-emerald-300 ring-1 ring-inset ring-emerald-900 shadow-game-glow'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-100',
                )
              }
            >
              <span aria-hidden className="w-5 text-center text-lg leading-none">
                {item.symbol}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto rounded-2xl border border-slate-800 bg-surface-850/80 p-4 text-xs text-slate-500">
          <p className="font-medium text-slate-200 truncate">{user?.username ?? 'Khách'}</p>
          <p className="mt-0.5 truncate">{user?.email ?? 'Chưa đăng nhập'}</p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top HUD */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-surface-900/70 px-6 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-xl bg-emerald-950/40 px-3 py-1.5 text-[11px] font-heading font-bold text-emerald-300 ring-1 ring-inset ring-emerald-900">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Năm {year} · Ngày {day}
            </div>
            <span className="text-xs text-slate-500">Thành phố trung tâm</span>
          </div>

          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Tài sản ròng</span>
              <span className="font-mono font-semibold text-emerald-300">
                {formatMoney(netWorth)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Energy</span>
              <span
                className={clsx(
                  'font-mono font-semibold',
                  energy < 30 ? 'text-rose-400' : 'text-emerald-300',
                )}
              >
                {energy}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Heat</span>
              <Badge variant={heatLevel > 60 ? 'error' : heatLevel > 30 ? 'warning' : 'success'}>
                {heatLevel}
              </Badge>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <GameButton variant="ghost" size="sm">
              Lưu game
            </GameButton>
            <GameButton variant="primary" size="sm">
              Tick ngay
            </GameButton>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-6 lg:p-8 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
