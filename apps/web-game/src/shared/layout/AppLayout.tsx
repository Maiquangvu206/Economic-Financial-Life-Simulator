import { useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { NavLink, Outlet } from 'react-router-dom';
import { useSessionStore } from '../../features/auth/sessionStore';
import { useGameStore } from '../../store/game';
import { formatCompact, formatMoney, formatVietnamDate, formatVietnamTime } from '../lib/format';
import { Badge } from '../ui/Badge';
import { GameButton } from '../ui/GameButton';

const NAV_ITEMS = [
  { to: '/', label: 'Thành phố', symbol: '▦', end: true },
  { to: '/finance', label: 'Tài chính', symbol: '₫' },
  { to: '/real-estate', label: 'Bất động sản', symbol: '⌂' },
  { to: '/business', label: 'Doanh nghiệp', symbol: '◇' },
  { to: '/stocks', label: 'Chứng khoán', symbol: '↗' },
  { to: '/law', label: 'Pháp lý', symbol: '§' },
  { to: '/underworld', label: 'Chợ đen', symbol: '☠' },
  { to: '/recap', label: 'Offline Recap', symbol: '◷' },
];

const SEASON_LABELS: Record<string, { label: string; icon: string; badgeCls: string }> = {
  spring: { label: 'Mùa Xuân', icon: '🌸', badgeCls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800' },
  summer: { label: 'Mùa Hạ', icon: '☀️', badgeCls: 'bg-amber-950/60 text-amber-300 border-amber-800' },
  autumn: { label: 'Mùa Thu', icon: '🍂', badgeCls: 'bg-orange-950/60 text-orange-300 border-orange-800' },
  winter: { label: 'Mùa Đông', icon: '❄️', badgeCls: 'bg-sky-950/60 text-sky-300 border-sky-800' },
};

const DEFAULT_SEASON = { label: 'Mùa Xuân', icon: '🌸', badgeCls: 'bg-emerald-950/60 text-emerald-300 border-emerald-800' };

const PERIOD_LABELS: Record<string, { label: string; icon: string }> = {
  dawn: { label: 'Rạng sáng', icon: '🌅' },
  day: { label: 'Ban ngày', icon: '☀️' },
  dusk: { label: 'Hoàng hôn', icon: '🌇' },
  night: { label: 'Ban đêm', icon: '🌙' },
};

const DEFAULT_PERIOD = { label: 'Ban ngày', icon: '☀️' };

export function AppLayout() {
  const user = useSessionStore((state) => state.user);
  const {
    netWorth,
    cash,
    heatLevel,
    energy,
    year,
    month,
    day,
    hour,
    minute,
    timeSpeed,
    isPaused,
    season,
    period,
    activeHoliday,
    education,
    tickTime,
    setTimeSpeed,
    togglePause,
  } = useGameStore();

  // Tự động cập nhật thời gian theo từng giây (mỗi 1s thực tế = 5 phút hoặc tuỳ speed)
  useEffect(() => {
    if (isPaused || timeSpeed === 0) return;

    const intervalTimeMs = Math.max(200, 1000 / timeSpeed);
    const interval = setInterval(() => {
      tickTime(5); // Nhảy 5 phút game mỗi chu kỳ
    }, intervalTimeMs);

    return () => clearInterval(interval);
  }, [isPaused, timeSpeed, tickTime]);

  // Bộ lọc màu overlay động phủ lên giao diện theo giờ và mùa
  const ambientOverlayStyle = useMemo(() => {
    switch (period) {
      case 'dawn':
        return 'bg-gradient-to-b from-amber-500/10 via-transparent to-orange-950/20';
      case 'dusk':
        return 'bg-gradient-to-b from-orange-600/15 via-rose-950/15 to-purple-950/25';
      case 'night':
        return 'bg-slate-950/40 backdrop-brightness-90';
      default:
        return '';
    }
  }, [period]);

  const currentSeason = SEASON_LABELS[season] ?? DEFAULT_SEASON;
  const currentPeriod = PERIOD_LABELS[period] ?? DEFAULT_PERIOD;

  return (
    <div className="relative flex min-h-screen bg-surface-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Dynamic ambient overlay theo giờ/mùa */}
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 z-40 transition-colors duration-1000',
          ambientOverlayStyle,
        )}
      />

      {/* Sidebar */}
      <aside className="relative z-30 hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-surface-900/90 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/80" />
            <p className="text-xs font-heading font-black uppercase tracking-[0.25em] text-emerald-400">
              EFLS VIỆT NAM
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-100">Mô phỏng Kinh tế & Cuộc sống</p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
            <span>Học vấn:</span>
            <span className="font-medium text-emerald-300 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60">
              {education.nameVi}
            </span>
          </div>
        </div>

        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/40 shadow-sm shadow-emerald-500/10'
                    : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-100',
                )
              }
            >
              <span aria-hidden className="w-5 text-center text-base font-mono">
                {item.symbol}
              </span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Thông tin nhân vật và học vấn */}
        <div className="mt-auto rounded-2xl border border-slate-800/80 bg-surface-850/90 p-4 text-xs text-slate-400 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-200 truncate">{user?.username ?? 'Công dân'}</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded">VN Citizen</span>
          </div>
          <div className="text-[11px] text-slate-300 flex items-center justify-between">
            <span>Trường tốt nghiệp:</span>
            <span className="text-slate-400">{education.schoolName}</span>
          </div>
          <div className="text-[11px] text-slate-300 flex items-center justify-between">
            <span>Chứng chỉ:</span>
            <span className="text-amber-300">{education.certificates[0] || 'Chưa có'}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-30 flex min-w-0 flex-1 flex-col">
        {/* Top HUD: Hiển thị ngày/tháng/năm, giờ, mùa, thời tiết, tiền bạc */}
        <header className="flex h-16 items-center justify-between border-b border-slate-800/80 bg-surface-900/80 px-6 backdrop-blur-md">
          {/* Lịch Ngày/Tháng/Năm & Giờ tự động chạy */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-slate-800/90 px-3 py-1.5 border border-slate-700/60 shadow-inner">
              <span className="text-sm font-mono font-bold text-amber-300">
                {formatVietnamTime(hour, minute)}
              </span>
              <span className="text-[11px] text-slate-400 border-l border-slate-700 pl-2">
                {currentPeriod.icon} {currentPeriod.label}
              </span>
              <span className="text-xs font-mono font-medium text-emerald-300 border-l border-slate-700 pl-2">
                {formatVietnamDate(day, month, year)}
              </span>
            </div>

            {/* Mùa và Ngày lễ */}
            <div className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-medium', currentSeason.badgeCls)}>
              <span>{currentSeason.icon}</span>
              <span>{currentSeason.label}</span>
            </div>

            {activeHoliday && (
              <div className="flex items-center gap-1.5 rounded-xl bg-rose-950/70 border border-rose-800/80 px-2.5 py-1 text-xs font-semibold text-rose-300">
                <span>🏮</span>
                <span>{activeHoliday.nameVi} (Nghỉ lễ)</span>
              </div>
            )}
          </div>

          {/* Chỉ số tài chính chuẩn Việt Nam */}
          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Tiền mặt:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {formatCompact(cash)}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <span className="text-slate-400">Tài sản ròng:</span>
              <span className="font-mono font-semibold text-slate-200">
                {formatCompact(netWorth)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400">Thể lực:</span>
              <div className="flex items-center gap-1 font-mono font-bold">
                <span className={clsx(energy < 30 ? 'text-rose-400' : 'text-emerald-300')}>
                  {energy}%
                </span>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-slate-400">Heat:</span>
              <Badge variant={heatLevel > 50 ? 'error' : 'default'}>
                {heatLevel}/100
              </Badge>
            </div>
          </div>
        </header>

        {/* Main Outlet */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
