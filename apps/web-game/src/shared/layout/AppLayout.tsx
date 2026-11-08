import { useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSessionStore } from '../../features/auth/sessionStore';
import { useGameStore } from '../../store/game';
import { formatCompact, formatMoney, formatVietnamDate, formatVietnamTime } from '../lib/format';
import { Badge } from '../ui/Badge';

const NAV_ITEMS = [
  { to: '/', label: 'Thành phố', symbol: '▦', end: true },
  { to: '/finance', label: 'Tài chính', symbol: '₫' },
  { to: '/real-estate', label: 'Bất động sản', symbol: '⌂' },
  { to: '/business', label: 'Doanh nghiệp', symbol: '◇' },
  { to: '/stocks', label: 'Chứng khoán', symbol: '↗' },
  { to: '/education', label: 'Giáo dục', symbol: '🎓' },
  { to: '/law', label: 'Pháp lý', symbol: '§' },
  { to: '/underworld', label: 'Chợ đen', symbol: '☠' },
  { to: '/recap', label: 'Offline Recap', symbol: '◷' },
];

const SEASON_LABELS: Record<string, { label: string; icon: string; badgeCls: string }> = {
  spring: {
    label: 'Mùa Xuân',
    icon: '🌸',
    badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  summer: { label: 'Mùa Hạ', icon: '☀️', badgeCls: 'bg-amber-100 text-amber-800 border-amber-200' },
  autumn: {
    label: 'Mùa Thu',
    icon: '🍂',
    badgeCls: 'bg-orange-100 text-orange-800 border-orange-200',
  },
  winter: { label: 'Mùa Đông', icon: '❄️', badgeCls: 'bg-sky-100 text-sky-800 border-sky-200' },
};

const DEFAULT_SEASON: { label: string; icon: string; badgeCls: string } = {
  label: 'Mùa Xuân',
  icon: '🌸',
  badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

const PERIOD_LABELS: Record<string, { label: string; icon: string }> = {
  dawn: { label: 'Rạng sáng', icon: '🌅' },
  day: { label: 'Ban ngày', icon: '☀️' },
  dusk: { label: 'Hoàng hôn', icon: '🌇' },
  night: { label: 'Ban đêm', icon: '🌙' },
};

const DEFAULT_PERIOD: { label: string; icon: string } = { label: 'Ban ngày', icon: '☀️' };

const ROLE_LABEL: Record<string, string> = {
  player: 'Công dân',
  moderator: 'Điều hành viên',
  admin: 'Quản trị viên',
};

export function AppLayout() {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const clearSession = useSessionStore((state) => state.clearSession);
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
    lastHolidayLetter,
    claimHolidayGift,
    dismissHolidayLetter,
    tickTime,
  } = useGameStore();

  // Tự động cập nhật thời gian theo từng giây (mỗi 1s thực tế = 5 phút hoặc tuỳ speed)
  useEffect(() => {
    if (isPaused || timeSpeed === 0) return;
    const intervalTimeMs = Math.max(200, 1000 / timeSpeed);
    const interval = setInterval(() => {
      tickTime(5);
    }, intervalTimeMs);
    return () => clearInterval(interval);
  }, [isPaused, timeSpeed, tickTime]);

  // Overlay pastel nhẹ thay đổi theo giờ trong ngày
  const ambientOverlayStyle = useMemo(() => {
    switch (period) {
      case 'dawn':
        return 'bg-gradient-to-b from-amber-200/25 via-transparent to-orange-100/30';
      case 'dusk':
        return 'bg-gradient-to-b from-orange-200/25 via-rose-200/20 to-violet-200/30';
      case 'night':
        return 'bg-gradient-to-b from-indigo-200/20 via-slate-200/10 to-indigo-300/20';
      default:
        return 'bg-gradient-to-b from-sky-100/20 via-transparent to-transparent';
    }
  }, [period]);

  const currentSeason = SEASON_LABELS[season] ?? DEFAULT_SEASON;
  const currentPeriod = PERIOD_LABELS[period] ?? DEFAULT_PERIOD;

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="relative flex min-h-screen bg-surface-50 text-slate-900 font-sans">
      {/* Overlay ánh sáng theo giờ/mùa */}
      <div
        className={clsx(
          'pointer-events-none fixed inset-0 z-40 transition-colors duration-1000',
          ambientOverlayStyle,
        )}
      />

      {/* Sidebar */}
      <aside className="relative z-30 hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white/80 px-4 py-6 backdrop-blur-xl lg:flex">
        <div className="px-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-xs font-heading font-black uppercase tracking-[0.25em] text-emerald-600">
              EFLS VIỆT NAM
            </p>
          </div>
          <p className="text-sm font-semibold text-slate-900">Mô phỏng Kinh tế & Cuộc sống</p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span>Học vấn:</span>
            <span className="font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
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
                    ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-slate-900',
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
        <div className="mt-auto space-y-2 rounded-2xl border border-slate-200 bg-white/90 p-4 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 truncate">
              {user?.username ?? 'Công dân'}
            </span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {ROLE_LABEL[user?.role ?? 'player'] ?? 'Công dân'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span>Trường tốt nghiệp:</span>
            <span className="text-slate-600">{education.schoolName}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span>Chứng chỉ:</span>
            <span className="text-amber-700">{education.certificates[0] || 'Chưa có'}</span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="relative z-30 flex min-w-0 flex-1 flex-col">
        {/* Top HUD: ngày/tháng/năm, giờ, mùa, thời tiết, tiền bạc */}
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-y-2 border-b border-slate-200 bg-white/80 px-6 py-2 backdrop-blur-md">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-white px-3 py-1.5 border border-slate-200 shadow-sm">
              <span className="text-sm font-mono font-bold text-amber-600">
                {formatVietnamTime(hour, minute)}
              </span>
              <span className="text-[11px] text-slate-500 border-l border-slate-200 pl-2">
                {currentPeriod.icon} {currentPeriod.label}
              </span>
              <span className="text-xs font-mono font-medium text-emerald-700 border-l border-slate-200 pl-2">
                {formatVietnamDate(day, month, year)}
              </span>
            </div>

            <div
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-medium',
                currentSeason.badgeCls,
              )}
            >
              <span>{currentSeason.icon}</span>
              <span>{currentSeason.label}</span>
            </div>

            {activeHoliday && (
              <div className="flex items-center gap-1.5 rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600">
                <span>🏮</span>
                <span>{activeHoliday.nameVi} (Nghỉ lễ)</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-slate-500">Tiền mặt:</span>
              <span className="font-mono font-bold text-emerald-600 text-sm">
                {formatCompact(cash)}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <span className="whitespace-nowrap text-slate-500">Tài sản ròng:</span>
              <span className="font-mono font-semibold text-slate-800">
                {formatCompact(netWorth)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-slate-500">Thể lực:</span>
              <span
                className={clsx(
                  'font-mono font-bold',
                  energy < 30 ? 'text-rose-600' : 'text-emerald-600',
                )}
              >
                {energy}%
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-slate-500">Heat:</span>
              <Badge variant={heatLevel > 50 ? 'error' : 'default'}>{heatLevel}/100</Badge>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 lg:hidden"
            >
              Thoát
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>

        {/* Modal Thư chúc mừng Lễ/Tết & Nhận Lì xì */}
        {lastHolidayLetter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg space-y-4 rounded-3xl border-2 border-amber-200 bg-white p-6 text-center shadow-soft">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-200 to-rose-200 text-3xl shadow-sm">
                🧧
              </div>

              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600">
                  {lastHolidayLetter.sender}
                </span>
                <h2 className="mt-1 text-lg font-heading font-black text-slate-900">
                  {lastHolidayLetter.title}
                </h2>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-left text-xs leading-relaxed text-slate-700">
                {lastHolidayLetter.content}
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-xs text-emerald-700 font-medium">
                  Phong bao phúc lợi chuyển vào tài khoản:
                </p>
                <p className="text-2xl font-mono font-black text-emerald-600 mt-1">
                  +{formatMoney(lastHolidayLetter.bonusCash)}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={claimHolidayGift}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-emerald-400 py-3 text-sm font-bold text-emerald-950 transition hover:brightness-105 shadow-md shadow-emerald-500/20"
                >
                  🎉 Nhận Lì Xì Ngay
                </button>
                <button
                  type="button"
                  onClick={dismissHolidayLetter}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
