import { useEffect, useMemo, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CharacterDto, NotificationDto, OfflinePlayerSettingsDto, OfflineProcessResponse } from '@efls/contracts';
import { useSessionStore } from '../../features/auth/sessionStore';
import { ChatWidget } from '../../features/chat/ChatWidget';
import { useGameStore } from '../../store/game';
import { apiRequest } from '../api/httpClient';
import { getGameSocket } from '../realtime/socket';
import { formatCompact, formatMoney, formatVietnamDate, formatVietnamTime } from '../lib/format';
import { Badge } from '../ui/Badge';
import { ToastContainer, toast } from '../ui/Toast';
import { DeathSuccessionModal } from '../identity/DeathSuccessionModal';
import { SeasonalEffects } from '../ui/SeasonalEffects';

type BroadcastItem = {
  id: string;
  title: string;
  content: string;
  type: 'urgent' | 'maintenance' | 'event' | 'economy' | 'news';
  scope: string;
  pinned: boolean;
  sender: string;
  createdAt: string;
};

const NAV_ITEMS = [
  { to: '/', label: 'Thành phố', symbol: '▦', end: true },
  { to: '/character', label: 'Nhân vật', symbol: '🪪' },
  { to: '/education', label: 'Giáo dục', symbol: '🎓' },
  { to: '/recruitment', label: 'Tuyển dụng', symbol: '💼' },
  { to: '/finance', label: 'Tài chính', symbol: '₫' },
  { to: '/real-estate', label: 'Bất động sản', symbol: '⌂' },
  { to: '/business', label: 'Doanh nghiệp', symbol: '◇' },
  { to: '/stocks', label: 'Chứng khoán', symbol: '↗' },
  { to: '/law', label: 'Pháp lý', symbol: '§' },
  { to: '/politics', label: 'Chính trị', symbol: '⚖' },
  { to: '/underworld', label: 'Chợ đen', symbol: '☠' },
  { to: '/gift-codes', label: 'Mã quà tặng', symbol: '🎁' },
  { to: '/recap', label: 'Khi vắng mặt', symbol: '◷' },
];

function getActiveDays(createdAt?: string | null) {
  if (!createdAt) return null;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  return Math.max(1, Math.floor(diff / 86_400_000) + 1);
}

const SEASON_LABELS: Record<string, { label: string; icon: string; badgeCls: string }> = {
  spring: { label: 'Mùa Xuân', icon: '🌸', badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  summer: { label: 'Mùa Hạ', icon: '☀️', badgeCls: 'bg-amber-100 text-amber-800 border-amber-200' },
  autumn: { label: 'Mùa Thu', icon: '🍂', badgeCls: 'bg-orange-100 text-orange-800 border-orange-200' },
  winter: { label: 'Mùa Đông', icon: '❄️', badgeCls: 'bg-sky-100 text-sky-800 border-sky-200' },
};
const DEFAULT_SEASON = SEASON_LABELS.spring;

const PERIOD_LABELS: Record<string, { label: string; icon: string }> = {
  dawn: { label: 'Rạng sáng', icon: '🌅' },
  day: { label: 'Ban ngày', icon: '☀️' },
  dusk: { label: 'Hoàng hôn', icon: '🌇' },
  night: { label: 'Ban đêm', icon: '🌙' },
};
const DEFAULT_PERIOD = PERIOD_LABELS.day;

const ROLE_LABEL: Record<string, string> = {
  player: 'Công dân',
  moderator: 'Điều hành viên',
  admin: 'Quản trị viên',
};

function fmtDate(iso: string) {
  try { return new Date(iso).toLocaleString('vi-VN'); } catch { return iso; }
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSessionStore((state) => state.user);
  const clearSession = useSessionStore((state) => state.clearSession);
  const {
    netWorth, cash, heatLevel, energy, year, month, day, hour, minute,
    isPaused, season, period, activeHoliday,
    lastHolidayLetter, claimHolidayGift, dismissHolidayLetter, tickTime, setSeason, setGameState, syncServerTime,
  } = useGameStore();
  const queryClient = useQueryClient();
  const [notifOpen, setNotifOpen] = useState(false);
  const [dismissedBroadcastIds, setDismissedBroadcastIds] = useState<string[]>([]);
  const [offlineChecked, setOfflineChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: me } = useQuery<CharacterDto>({
    queryKey: ['characters', 'me'],
    queryFn: () => apiRequest<CharacterDto>('/api/v1/characters/me'),
    retry: 1,
    staleTime: 15000,
  });
  const isDead = me?.isAlive === false;
  const isRestricted = user?.status === 'restricted';

  // Đồng bộ thanh báo cáo (topbar) theo dữ liệu nhân vật thực từ server, tránh hiển thị dữ liệu mẫu
  const prevCashRef = useRef<number | null>(null);
  useEffect(() => {
    if (!me) return;
    const nextCash = me.cash?.amount ?? 0;
    const prevCash = prevCashRef.current;
    if (prevCash !== null && nextCash !== prevCash) {
      const delta = nextCash - prevCash;
      if (delta !== 0) {
        const sign = delta > 0 ? '+' : '-';
        toast({
          title: `${sign}${formatMoney(Math.abs(delta))} ₫`,
          description: `Số dư: ${formatMoney(nextCash)} ₫`,
          variant: delta > 0 ? 'success' : 'warning',
          durationMs: 3000,
        });
      }
    }
    prevCashRef.current = nextCash;

    setGameState({
      cash: nextCash,
      netWorth: me.netWorth?.amount ?? nextCash,
      energy: typeof me.healthEnergy === 'number' ? me.healthEnergy : 100,
      heatLevel: typeof me.heatLevel === 'number' ? me.heatLevel : 0,
      creditScore: typeof me.creditScore === 'number' ? me.creditScore : 650,
    });
  }, [me, setGameState]);

  const { data: broadcasts = [] } = useQuery<BroadcastItem[]>({
    queryKey: ['broadcasts', 'active'],
    queryFn: () => apiRequest<BroadcastItem[]>('/api/v1/broadcasts/active'),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: notifications = [] } = useQuery<NotificationDto[]>({
    queryKey: ['notifications', 'mine'],
    queryFn: () => apiRequest<NotificationDto[]>('/api/v1/notifications?limit=50'),
    refetchInterval: 30000,
    staleTime: 10000,
  });

  type RestrictionContact = {
    enabled?: boolean;
    title?: string;
    message?: string;
    email?: string;
    phone?: string;
    zalo?: string;
    discord?: string;
    other?: string;
  };
  const { data: gameConfig } = useQuery<{
    season?: 'spring' | 'summer' | 'autumn' | 'winter';
    currentDay?: number;
    dayOfYear?: number;
    currentYear?: number;
    currentMonth?: number;
    currentDayOfMonth?: number;
    hour?: number;
    minute?: number;
    period?: 'dawn' | 'day' | 'dusk' | 'night';
    restrictionContact?: RestrictionContact;
    maintenance?: { enabled?: boolean; title?: string; message?: string };
    seasonEffects?: Record<string, { productivityPct: number; energyPct: number; taxPct: number; revenuePct: number }>;
  }>({
    queryKey: ['game-config'],
    queryFn: () => apiRequest('/api/v1/game-config'),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const maintenance = gameConfig?.maintenance;
  const isMaintenance = !!maintenance?.enabled && user?.role === 'player';

  useEffect(() => {
    if (!gameConfig) return;
    syncServerTime({
      currentYear: gameConfig.currentYear,
      currentMonth: gameConfig.currentMonth,
      currentDay: gameConfig.currentDay,
      currentDayOfMonth: gameConfig.currentDayOfMonth,
      dayOfYear: gameConfig.dayOfYear,
      hour: gameConfig.hour,
      minute: gameConfig.minute,
      season: gameConfig.season,
      period: gameConfig.period,
      tickUpdatedAt: (gameConfig as any).tickUpdatedAt,
    });
  }, [
    gameConfig?.currentYear,
    gameConfig?.currentMonth,
    gameConfig?.currentDay,
    gameConfig?.currentDayOfMonth,
    gameConfig?.dayOfYear,
    gameConfig?.hour,
    gameConfig?.minute,
    gameConfig?.season,
    gameConfig?.period,
    (gameConfig as any)?.tickUpdatedAt,
    syncServerTime,
  ]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  // Xử lý offline khi quay lại (một lần mỗi phiên tải app): cập nhật mốc/recap và hiển thị nếu được bật
  useEffect(() => {
    if (isRestricted || isMaintenance) return;
    if (!me || offlineChecked) return;
    let cancelled = false;
    (async () => {
      try {
        const [settings, result] = await Promise.all([
          apiRequest<OfflinePlayerSettingsDto>('/api/v1/offline/settings'),
          apiRequest<OfflineProcessResponse>('/api/v1/offline/process', { method: 'POST' }),
        ]);
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: ['offline'] });
        void queryClient.invalidateQueries({ queryKey: ['characters', 'me'] });
        const hasRecap = !!result.recap;
        const meaningful = !!result.processed || (result.recap?.events ?? []).some((e) => e.type !== 'info');
        const recapShownKey = 'efls.recapShown';
        const recapAlreadyShown = sessionStorage.getItem(recapShownKey) === '1';
        if (!recapAlreadyShown && settings.showRecapOnLogin && hasRecap && meaningful && location.pathname !== '/recap') {
          sessionStorage.setItem(recapShownKey, '1');
          toast({
            title: 'Tóm tắt khi vắng mặt',
            description: result.message || 'Đã cập nhật những thay đổi trong thời gian bạn vắng mặt.',
            variant: 'info',
          });
          navigate('/recap');
        } else if (meaningful && result.message) {
          toast({ title: 'Cập nhật khi vắng mặt', description: result.message, variant: 'info' });
        }
      } catch {
        // best-effort: không chặn trải nghiệm nếu offline API chưa sẵn sàng
      } finally {
        if (!cancelled) setOfflineChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me, offlineChecked, queryClient, navigate, location.pathname, isRestricted, isMaintenance]);

  // Nhận thông báo & thời gian game realtime -> đồng bộ dữ liệu/toast/clock
  useEffect(() => {
    const socket = getGameSocket();
    const onNotification = (payload: any) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
      void queryClient.invalidateQueries({ queryKey: ['game-config'] });

      const bodyText = String(payload?.body || '');
      // Khi tài khoản bị khóa: tự động đăng xuất theo thời gian thực
      if (
        payload?.kind === 'admin_action' &&
        (bodyText.includes('bị khóa') || bodyText.includes('đã bị khóa') || bodyText.includes('khóa tài khoản'))
      ) {
        toast({
          title: payload.title || 'Thông báo từ quản trị hệ thống',
          description: payload.body || 'Tài khoản của bạn đã bị khóa.',
          variant: 'error',
        });
        clearSession();
        navigate('/login', { replace: true });
        return;
      }

      if (payload?.title || payload?.body) {
        toast({
          title: payload.title || 'Thông báo hệ thống',
          description: payload.body,
          variant: payload?.kind === 'error' ? 'error' : payload?.pinned || payload?.kind === 'urgent' ? 'warning' : 'info',
        });
      }
    };
    const onGameTime = (payload: any) => {
      if (!payload) return;
      syncServerTime({
        currentYear: payload.currentYear,
        currentMonth: payload.currentMonth,
        currentDayOfMonth: payload.currentDayOfMonth,
        dayOfYear: payload.dayOfYear ?? payload.currentDay,
        hour: payload.hour ?? 0,
        minute: payload.minute ?? 0,
        season: payload.season,
        period: payload.period,
        tickUpdatedAt: payload.tickUpdatedAt ?? payload.at,
      });
      void queryClient.invalidateQueries({ queryKey: ['game-config'] });
    };
    socket.on('notification', onNotification as never);
    (socket as any).on('game:time', onGameTime);
    return () => {
      socket.off('notification', onNotification as never);
      (socket as any).off('game:time', onGameTime);
    };
  }, [queryClient, clearSession, navigate, syncServerTime]);

  const unreadCount = notifications.filter((n) => !n.readAt).length;
  const hudBroadcasts = useMemo(
    () => broadcasts.filter((b) => b.pinned || b.type === 'urgent').filter((b) => !dismissedBroadcastIds.includes(b.id)).slice(0, 3),
    [broadcasts, dismissedBroadcastIds],
  );

  // Chuẩn hệ thống: 1 ngày trong game = 1 phút thực tế (24 phút game mỗi giây thực, đồng bộ từ server tick)
  useEffect(() => {
    if (isPaused || isDead || isMaintenance) return;
    const interval = setInterval(() => {
      tickTime(24);
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, isDead, isMaintenance, tickTime]);

  // Overlay pastel nhẹ thay đổi theo giờ trong ngày
  const ambientOverlayStyle = useMemo(() => {
    switch (period) {
      case 'dawn': return 'bg-gradient-to-b from-amber-200/25 via-transparent to-orange-100/30';
      case 'dusk': return 'bg-gradient-to-b from-orange-200/25 via-rose-200/20 to-violet-200/30';
      case 'night': return 'bg-gradient-to-b from-indigo-200/20 via-slate-200/10 to-indigo-300/20';
      default: return 'bg-gradient-to-b from-sky-100/20 via-transparent to-transparent';
    }
  }, [period]);

  const currentSeason = (SEASON_LABELS[season] ?? DEFAULT_SEASON) as { label: string; icon: string; badgeCls: string };
  const currentPeriod = (PERIOD_LABELS[period] ?? DEFAULT_PERIOD) as { label: string; icon: string };

  const seasonEffect = gameConfig?.seasonEffects?.[String(season ?? 'spring')];
  const seasonEffectTitle = seasonEffect
    ? `Hiệu ứng mùa: năng suất ${seasonEffect.productivityPct}% · thể lực ${seasonEffect.energyPct}% · thuế ${seasonEffect.taxPct}% · doanh thu ${seasonEffect.revenuePct}%`
    : undefined;

  async function markAllRead() {
    try {
      await apiRequest('/api/v1/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch { /* ignore */ }
  }

  async function markNotificationRead(id: string) {
    try {
      await apiRequest('/api/v1/notifications/read', { method: 'POST', body: JSON.stringify({ ids: [id] }) });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    } catch { /* ignore */ }
  }

  function handleLogout() {
    clearSession();
    navigate('/login', { replace: true });
  }

  const restrictionContact = gameConfig?.restrictionContact;

  return (
    <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-surface-50 text-slate-900 font-sans">
      <ToastContainer />
      <ChatWidget />
      {menuOpen && (
        <button
          type="button"
          aria-label="Đóng menu"
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {isMaintenance && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-2xl">🛠️</div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-heading font-black text-slate-900">
                  {maintenance?.title?.trim() || 'Hệ thống đang bảo trì'}
                </h2>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                  {maintenance?.message?.trim() || 'Hệ thống đang tạm dừng để nâng cấp hoặc sửa chữa. Vui lòng quay lại sau.'}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Trong thời gian này, các thao tác trong trò chơi sẽ tạm dừng để đảm bảo dữ liệu an toàn. Bạn có thể đăng xuất và quay lại sau.
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
      {isRestricted && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-2xl">🚫</div>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-heading font-black text-slate-900">
                  {restrictionContact?.title || 'Tài khoản đang bị hạn chế'}
                </h2>
                <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">
                  {restrictionContact?.message ||
                    'Tài khoản của bạn đang bị hạn chế thao tác. Toàn bộ chức năng game đã bị khóa cho đến khi được quản trị viên gỡ hạn chế.'}
                </p>
                {user?.restrictionReason ? (
                  <p className="mt-2 text-sm text-rose-700">
                    <span className="font-semibold">Lý do/Ghi chú:</span> {user.restrictionReason}
                  </p>
                ) : null}
              </div>
            </div>

            {restrictionContact?.enabled !== false && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">Thông tin liên hệ hỗ trợ gỡ hạn chế</div>
                <div className="space-y-1.5 text-sm text-slate-800">
                  {restrictionContact?.email ? (
                    <div><span className="font-semibold text-slate-600">Email:</span> {restrictionContact.email}</div>
                  ) : null}
                  {restrictionContact?.phone ? (
                    <div><span className="font-semibold text-slate-600">Hotline/SĐT:</span> {restrictionContact.phone}</div>
                  ) : null}
                  {restrictionContact?.zalo ? (
                    <div><span className="font-semibold text-slate-600">Zalo/Nhắn tin:</span> {restrictionContact.zalo}</div>
                  ) : null}
                  {restrictionContact?.discord ? (
                    <div><span className="font-semibold text-slate-600">Discord/Cộng đồng:</span> {restrictionContact.discord}</div>
                  ) : null}
                  {restrictionContact?.other ? (
                    <div><span className="font-semibold text-slate-600">Khác:</span> {restrictionContact.other}</div>
                  ) : null}
                  {!restrictionContact?.email &&
                    !restrictionContact?.phone &&
                    !restrictionContact?.zalo &&
                    !restrictionContact?.discord &&
                    !restrictionContact?.other && (
                      <div className="text-slate-600 text-xs">Quản trị viên chưa cấu hình kênh liên hệ cụ thể. Vui lòng liên hệ đội ngũ hỗ trợ/quản trị của hệ thống để được gỡ hạn chế.</div>
                    )}
                </div>
              </div>
            )}

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Tài khoản của bạn hiện <b>không thể thao tác bất kỳ chức năng game</b> nào cho đến khi được gỡ hạn chế. Bạn có thể đăng xuất và quay lại sau khi quản trị viên xử lý.
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
              >
                Đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
      <DeathSuccessionModal
        open={isDead}
        onCompleted={() => {
          void queryClient.invalidateQueries({ queryKey: ['characters'] });
          void queryClient.invalidateQueries({ queryKey: ['succession'] });
          window.location.reload();
        }}
      />
      {/* Overlay ánh sáng theo giờ/mùa */}
      <div className={clsx('pointer-events-none fixed inset-0 z-40 transition-colors duration-1000', ambientOverlayStyle)} />
      <SeasonalEffects season={(season as any) || 'spring'} />

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-full w-72 max-w-[85vw] flex-shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:shadow-none lg:py-6',
          menuOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="px-2">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-xs font-heading font-black uppercase tracking-[0.25em] text-emerald-600">EFLS VIỆT NAM</p>
          </div>
          <p className="text-sm font-semibold text-slate-900">Mô phỏng Kinh tế & Cuộc sống</p>
          <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
            <span>Số ngày hoạt động:</span>
            <span className="font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              {getActiveDays(user?.createdAt ?? me?.createdAt) ?? '—'} ngày
            </span>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between lg:hidden">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Menu</span>
          <button type="button" onClick={() => setMenuOpen(false)} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50">Đóng</button>
        </div>
        <nav className="mt-2 flex flex-1 min-h-0 flex-col gap-1 overflow-y-auto [scrollbar-width:thin] lg:mt-6">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900',
                )
              }
            >
              <span aria-hidden className="w-5 text-center text-base font-mono">{item.symbol}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Thông tin nhân vật */}
        <div className="mt-auto space-y-2 rounded-2xl border border-slate-200 bg-white/90 p-4 text-xs text-slate-500">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-800 truncate">{user?.username ?? 'Công dân'}</span>
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">{ROLE_LABEL[user?.role ?? 'player'] ?? 'Công dân'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span>Số ngày hoạt động:</span>
            <span className="font-medium text-slate-700">{getActiveDays(user?.createdAt ?? me?.createdAt) ?? '—'} ngày</span>
          </div>
          <button type="button" onClick={handleLogout} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Phía phải */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex w-full flex-shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-4 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:gap-y-2 lg:px-6 lg:py-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
              aria-label="Mở menu"
            >
              <span className="text-lg leading-none">☰</span>
            </button>
            <div className="flex min-w-0 flex-wrap items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm sm:px-3">
              <span className="text-sm font-mono font-bold text-amber-600">{year > 0 ? formatVietnamTime(hour, minute) : '--:--'}</span>
              <span className="hidden border-l border-slate-200 pl-2 text-[11px] text-slate-500 sm:inline">{currentPeriod.icon} {currentPeriod.label}</span>
              <span className="border-l border-slate-200 pl-2 text-[11px] font-mono font-medium text-emerald-700 sm:text-xs">{year > 0 ? formatVietnamDate(day, month, year) : 'Đang đồng bộ...'}</span>
            </div>
            <div title={seasonEffectTitle} className={clsx('hidden items-center gap-1.5 rounded-xl border px-2.5 py-1 text-xs font-medium sm:flex', currentSeason.badgeCls)}>
              <span>{currentSeason.icon}</span><span>{currentSeason.label}</span>
            </div>
            {activeHoliday && (
              <div className="hidden items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-600 md:flex">
                <span>🏮</span><span>{activeHoliday.nameVi} (Nghỉ lễ)</span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs sm:gap-3 lg:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="whitespace-nowrap text-slate-500">Tiền mặt:</span>
              <span className="font-mono text-sm font-bold text-emerald-600">{me ? formatCompact(cash) : '—'}</span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <span className="whitespace-nowrap text-slate-500">Tài sản ròng:</span>
              <span className="font-mono font-semibold text-slate-800">{me ? formatCompact(netWorth) : '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="whitespace-nowrap text-slate-500">Thể lực:</span>
              <span className={clsx('font-mono font-bold', energy < 30 ? 'text-rose-600' : 'text-emerald-600')}>{energy}%</span>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-slate-500">Mức chú ý:</span>
              <Badge variant={heatLevel > 50 ? 'error' : 'default'}>{heatLevel}/100</Badge>
            </div>

            {/* Notification center */}
            <div className="relative ml-auto sm:ml-0">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:bg-slate-50"
                title="Thông báo"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold text-white">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-[min(380px,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                    <span className="text-xs font-semibold text-slate-800">Thông báo & bản tin hệ thống</span>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => void markAllRead()} className="text-[11px] text-emerald-700 hover:underline">Đánh dấu đã đọc</button>
                      <button type="button" onClick={() => setNotifOpen(false)} className="text-[11px] text-slate-500">Đóng</button>
                    </div>
                  </div>
                  <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
                    {broadcasts.length > 0 && (
                      <div className="bg-amber-50/40 p-2">
                        <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Thông báo hệ thống</div>
                        {broadcasts.slice(0, 5).map((b) => (
                          <div key={`bc-${b.id}`} className="mb-1 rounded-xl border border-amber-100 bg-white p-2">
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              {b.pinned && <span className="font-bold text-amber-700">📌 GHIM</span>}
                              <span>{fmtDate(b.createdAt)}</span>
                            </div>
                            <div className="mt-0.5 text-xs font-semibold text-slate-900">{b.title}</div>
                            <div className="mt-0.5 line-clamp-3 whitespace-pre-wrap text-[11px] text-slate-600">{b.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {notifications.length === 0 && broadcasts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">Chưa có thông báo.</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => { if (!n.readAt) void markNotificationRead(n.id); }}
                          onKeyDown={(e) => {
                            if ((e.key === 'Enter' || e.key === ' ') && !n.readAt) {
                              e.preventDefault();
                              void markNotificationRead(n.id);
                            }
                          }}
                          className={clsx(
                            'p-3 transition-colors',
                            !n.readAt ? 'cursor-pointer bg-emerald-50/40 hover:bg-emerald-50/70' : 'bg-white',
                          )}
                        >
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span className="font-medium">{n.kind}</span>
                            <span>{fmtDate(n.createdAt)}</span>
                          </div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-900">{n.title}</div>
                          <div className="mt-0.5 whitespace-pre-wrap text-[11px] text-slate-600">{n.body}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button type="button" onClick={handleLogout} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 lg:hidden">
              Thoát
            </button>
          </div>
        </header>

        {/* HUD broadcasts */}
        {hudBroadcasts.length > 0 && (
          <div className="flex-shrink-0 space-y-2 border-b border-amber-200 bg-amber-50/70 px-4 py-2">
            {hudBroadcasts.map((b) => (
              <div key={b.id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-white/80 px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-bold text-amber-700">{b.pinned ? '📌 Thông báo hệ thống' : '🚨 Khẩn cấp'}</span>
                    <span className="text-slate-500">{fmtDate(b.createdAt)}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-900 truncate">{b.title}</div>
                  <div className="text-[11px] text-slate-600 line-clamp-2">{b.content}</div>
                </div>
                <button type="button" onClick={() => setDismissedBroadcastIds((s) => [...s, b.id])} className="shrink-0 text-[11px] text-slate-500 hover:text-slate-800">Ẩn</button>
              </div>
            ))}
          </div>
        )}

        {/* Main */}
        <main className="w-full flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6">
          {isMaintenance ? (
            <div className="flex h-full items-center justify-center text-slate-500 text-sm">Hệ thống đang bảo trì. Vui lòng quay lại sau.</div>
          ) : isRestricted ? (
            <div className="flex h-full items-center justify-center text-slate-500 text-sm">Tài khoản đang bị hạn chế. Vui lòng xem thông báo và liên hệ quản trị viên để được gỡ.</div>
          ) : isDead ? (
            <div className="flex h-full items-center justify-center text-slate-500">Nhân vật đã qua đời. Vui lòng hoàn tất kế thừa.</div>
          ) : (
            <Outlet />
          )}
        </main>

        {/* Modal Thư chúc mừng Lễ/Tết & Nhận Lì xì */}
        {lastHolidayLetter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg space-y-4 rounded-3xl border-2 border-amber-200 bg-white p-6 text-center shadow-soft">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-200 to-rose-200 text-3xl shadow-sm">🧧</div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600">{lastHolidayLetter.sender}</span>
                <h2 className="mt-1 text-lg font-heading font-black text-slate-900">{lastHolidayLetter.title}</h2>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-left text-xs leading-relaxed text-slate-700">{lastHolidayLetter.content}</div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-xs text-emerald-700 font-medium">Phong bao phúc lợi chuyển vào tài khoản:</p>
                <p className="text-2xl font-mono font-black text-emerald-600 mt-1">+{formatMoney(lastHolidayLetter.bonusCash)}</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    await claimHolidayGift();
                    await queryClient.invalidateQueries({ queryKey: ['characters'] });
                    await queryClient.invalidateQueries({ queryKey: ['banking'] });
                  }}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-amber-400 to-emerald-400 py-3 text-sm font-bold text-emerald-950 transition hover:brightness-105 shadow-md shadow-emerald-500/20"
                >
                  🎉 Nhận Lì Xì Ngay
                </button>
                <button type="button" onClick={dismissHolidayLetter} className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100">
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
