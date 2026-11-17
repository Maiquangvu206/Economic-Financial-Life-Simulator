import { create } from 'zustand';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayPeriod = 'dawn' | 'day' | 'dusk' | 'night';

export interface GameHoliday {
  id: string;
  nameVi: string;
  day: number;
  month: number;
  isDaysOff: boolean;
  otPayMultiplier: number;
}

export interface GameState {
  // Thời gian thực trong game (đồng bộ theo server; 1 ngày game = 1 phút thực)
  year: number;
  month: number;
  day: number;
  dayOfYear: number;
  hour: number;
  minute: number;
  tickAnchorAt: number | null; // mốc thời gian thực khi bắt đầu ngày game hiện tại (từ server)
  timeSpeed: number; // giữ tương thích; tốc độ thực tế cố định: 1 ngày game = 1 phút thực
  isPaused: boolean;

  // Mùa & Thời tiết
  season: Season;
  period: DayPeriod;
  weather: 'sunny' | 'rainy' | 'storm' | 'cloudy' | 'cold';
  activeHoliday: GameHoliday | null;

  // Hộp thư quà Tết & Lì xì
  holidayGiftClaimed: Record<string, boolean>; // Lưu id holiday đã nhận quà trong năm
  lastHolidayLetter: { title: string; sender: string; content: string; bonusCash: number } | null;

  // Nhân vật: Học vấn khởi điểm chỉ có THPT
  education: {
    level: 'high_school' | 'vocational' | 'bachelor' | 'master' | 'doctorate';
    nameVi: string;
    certificates: string[];
    schoolName: string;
  };

  // Tài chính & Chỉ số (Chuẩn VNĐ)
  cash: number;
  netWorth: number;
  creditScore: number;
  heatLevel: number;
  energy: number;
  incomePerMonth: number;
  expensePerMonth: number;
  loanCount: number;

  // Actions
  dismissHolidayLetter: () => void;
  claimHolidayGift: () => Promise<void>;
  tickTime: (deltaMinutes?: number) => void;
  syncServerTime: (time: {
    currentYear?: number;
    currentMonth?: number;
    currentDay?: number;
    currentDayOfMonth?: number;
    dayOfYear?: number;
    hour?: number;
    minute?: number;
    season?: Season;
    period?: DayPeriod;
    tickUpdatedAt?: string | number | Date | null;
  }) => void;
  setTimeSpeed: (speed: number) => void;
  togglePause: () => void;
  setSeason: (season: Season) => void;
  setWeather: (weather: GameState['weather']) => void;
  setGameState: (partial: Partial<GameState>) => void;
  addCash: (delta: number) => void;
  setEnergy: (value: number) => void;
  addHeat: (delta: number) => void;
}

const DEFAULT_HOLIDAYS: GameHoliday[] = [
  {
    id: 'tet_duong',
    nameVi: 'Tết Dương Lịch',
    day: 1,
    month: 1,
    isDaysOff: true,
    otPayMultiplier: 3.0,
  },
  {
    id: 'tet_nguyen_dan',
    nameVi: 'Tết Nguyên Đán',
    day: 10,
    month: 2,
    isDaysOff: true,
    otPayMultiplier: 3.0,
  },
  {
    id: 'hung_kings',
    nameVi: 'Giỗ Tổ Hùng Vương',
    day: 18,
    month: 4,
    isDaysOff: true,
    otPayMultiplier: 3.0,
  },
  { id: 'le_30_4', nameVi: '30/4 - 1/5', day: 30, month: 4, isDaysOff: true, otPayMultiplier: 3.0 },
  {
    id: 'quoc_khanh',
    nameVi: 'Quốc khánh 2/9',
    day: 2,
    month: 9,
    isDaysOff: true,
    otPayMultiplier: 3.0,
  },
];

function calculateSeason(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

function calculateDayPeriod(hour: number): DayPeriod {
  if (hour >= 4 && hour < 6) return 'dawn';
  if (hour >= 6 && hour < 17) return 'day';
  if (hour >= 17 && hour < 19) return 'dusk';
  return 'night';
}

const GAME_MS_PER_DAY = 60_000;

function computeFromAnchor(state: Pick<GameState, 'year' | 'month' | 'day' | 'dayOfYear' | 'hour' | 'minute' | 'season' | 'tickAnchorAt' | 'isPaused'>, nowMs = Date.now()) {
  let hour = 0;
  let minute = 0;
  let hasProgress = false;
  if (state.tickAnchorAt != null && !state.isPaused) {
    const elapsed = Math.max(0, Math.min(GAME_MS_PER_DAY - 1, nowMs - state.tickAnchorAt));
    const totalGameMinutes = Math.floor((elapsed / GAME_MS_PER_DAY) * 24 * 60);
    hour = Math.floor(totalGameMinutes / 60) % 24;
    minute = totalGameMinutes % 60;
    hasProgress = true;
  } else if (state.tickAnchorAt != null && state.isPaused) {
    // giữ nguyên giờ/phút hiện tại khi tạm dừng (anchor đã được điều chỉnh)
    hour = state.hour;
    minute = state.minute;
    hasProgress = true;
  }
  if (!hasProgress) {
    // Chưa có mốc server: giữ hiển thị hiện tại, không tự suy luận tiến trình
    hour = state.hour;
    minute = state.minute;
  }
  const period = calculateDayPeriod(hour);
  const holiday = DEFAULT_HOLIDAYS.find((h) => h.day === state.day && h.month === state.month) ?? null;
  return { hour, minute, period, holiday };
}

export const useGameStore = create<GameState>((set, get) => ({
  // Mốc khởi đầu hiển thị: chờ đồng bộ server (tránh hiển thị 01/01/2000 giả)
  year: 0,
  month: 0,
  day: 0,
  dayOfYear: 0,
  hour: 0,
  minute: 0,
  tickAnchorAt: null,
  timeSpeed: 1, // cố định: 1 ngày game = 1 phút thực (24 phút game/giây thực)
  isPaused: false,

  season: 'spring',
  period: 'day',
  weather: 'sunny',
  activeHoliday: null,
  holidayGiftClaimed: {},
  lastHolidayLetter: null,

  // Học vấn khởi điểm chỉ có THPT
  education: {
    level: 'high_school',
    nameVi: 'Tốt nghiệp THPT (Cấp 3)',
    certificates: ['Bằng lái xe máy A1'],
    schoolName: 'THPT Chu Văn An',
  },

  // Tài chính: chờ đồng bộ từ server (tránh hiển thị 15tr giả)
  cash: 0,
  netWorth: 0,
  creditScore: 650,
  heatLevel: 0,
  energy: 100,
  incomePerMonth: 8_500_000, // 8.5 triệu / tháng
  expensePerMonth: 4_500_000,
  loanCount: 0,

  dismissHolidayLetter: () => set({ lastHolidayLetter: null }),

  claimHolidayGift: async () => {
    const state = get();
    const letter = state.lastHolidayLetter;
    if (!letter) return;
    try {
      // gửi claim lên server để cộng tiền thật vào tài khoản nhân vật hiện tại
      const { apiRequest } = await import('../shared/api/httpClient');
      const year = state.year;
      const holiday = state.activeHoliday;
      const res = await apiRequest<{
        ok: boolean;
        claimed: boolean;
        amount?: { amount: number; currency: string };
        balanceAfter?: { amount: number; currency: string };
        message?: string;
      }>('/api/v1/welfare/claim', {
        method: 'POST',
        body: JSON.stringify({
          code: holiday?.id,
          periodYear: year,
          gameYear: year,
          gameMonth: state.month,
          gameDay: state.day,
        }),
      });
      if (res?.balanceAfter?.amount != null) {
        set((s) => ({
          cash: res.balanceAfter!.amount,
          netWorth: Math.max(s.netWorth, res.balanceAfter!.amount),
          lastHolidayLetter: null,
        }));
      } else {
        // fallback: đóng thư, số dư sẽ đồng bộ từ server
        set({ lastHolidayLetter: null });
      }
    } catch {
      // nếu claim server lỗi, không cộng local để tránh sai số dư; đóng thư để thử lại khi có thông báo/kỳ hợp lệ
      set({ lastHolidayLetter: null });
    }
  },

  tickTime: () => {
    const state = get();
    if (state.isPaused) return;
    const { hour, minute, period, holiday } = computeFromAnchor(state);
    let { holidayGiftClaimed, lastHolidayLetter } = state;
    // Hiển thị thư chúc mừng/ngày lễ khi đến đúng ngày (client prompt; claim thực tế qua server)
    if (holiday) {
      const claimKey = `${state.year}-${holiday.id}`;
      if (!holidayGiftClaimed[claimKey]) {
        holidayGiftClaimed = { ...holidayGiftClaimed, [claimKey]: true };
        const isTet = holiday.id.includes('tet');
        lastHolidayLetter = {
          title: isTet
            ? '🧧 THƯ CHÚC TẾT & LÌ XÌ ĐẦU NĂM'
            : `🏮 THƯ CHÚC MỪNG DỊP LỄ ${holiday.nameVi.toUpperCase()}`,
          sender: isTet
            ? 'Ủy ban Nhân dân Thành phố & Hiệp hội Doanh nghiệp'
            : 'Bộ Lao động & Quỹ Phúc lợi Công dân',
          content: isTet
            ? `Nhân dịp Tết Nguyên Đán năm ${state.year}, kính chúc công dân và gia đình An Khang Thịnh Vượng, Vạn Sự Như Ý! Ủy ban gửi tặng bạn phong bao lì xì may mắn để khởi đầu năm mới hanh thông.`
            : `Nhân dịp kỷ niệm ${holiday.nameVi}, xin gửi tới bạn lời chúc mừng nồng nhiệt cùng khoản tiền thưởng phúc lợi xã hội đã được chuyển vào tài khoản!`,
          bonusCash: isTet ? 2_000_000 : 1_000_000,
        };
      }
    }
    // Chỉ cập nhật khi có thay đổi để tránh render thừa
    if (
      hour !== state.hour ||
      minute !== state.minute ||
      period !== state.period ||
      holiday?.id !== state.activeHoliday?.id ||
      lastHolidayLetter !== state.lastHolidayLetter ||
      holidayGiftClaimed !== state.holidayGiftClaimed
    ) {
      set({ hour, minute, period, activeHoliday: holiday, holidayGiftClaimed, lastHolidayLetter });
    }
  },

  syncServerTime: (time) => {
    const s = get();
    const rawYear = Number(time.currentYear);
    const nextYear = Number.isFinite(rawYear) && rawYear > 0 ? Math.floor(rawYear) : s.year;

    // Ưu tiên dayOfYear/currentDay (0-359) từ server làm nguồn chuẩn để suy ra tháng/ngày
    let nextDayOfYear: number | null = null;
    if (typeof time.dayOfYear === 'number' && Number.isFinite(time.dayOfYear)) {
      nextDayOfYear = ((Math.floor(time.dayOfYear) % 360) + 360) % 360;
    } else if (typeof time.currentDay === 'number' && Number.isFinite(time.currentDay)) {
      const cd = Math.floor(time.currentDay);
      if (cd >= 0 && cd <= 359) nextDayOfYear = cd;
    }

    let nextMonth = Number.isFinite(Number(time.currentMonth)) ? Math.floor(Number(time.currentMonth)) : NaN;
    let dayOfMonth = Number.isFinite(Number(time.currentDayOfMonth)) ? Math.floor(Number(time.currentDayOfMonth)) : NaN;

    if (nextDayOfYear != null) {
      nextMonth = Math.floor(nextDayOfYear / 30) + 1;
      dayOfMonth = (nextDayOfYear % 30) + 1;
    } else {
      if (!Number.isFinite(nextMonth) || nextMonth < 1) nextMonth = s.month;
      if (nextMonth > 12) nextMonth = ((nextMonth - 1) % 12) + 1;
      if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1) dayOfMonth = s.day;
      if (dayOfMonth > 30) dayOfMonth = ((dayOfMonth - 1) % 30) + 1;
      nextDayOfYear = (Math.max(1, nextMonth) - 1) * 30 + (Math.max(1, dayOfMonth) - 1);
    }

    nextMonth = Math.min(12, Math.max(1, nextMonth));
    dayOfMonth = Math.min(30, Math.max(1, dayOfMonth));
    nextDayOfYear = ((Math.floor(nextDayOfYear) % 360) + 360) % 360;

    const nextSeason = time.season ?? calculateSeason(nextMonth);

    // Mốc tiến trình thực tế: ưu tiên tickUpdatedAt từ server (lưu trữ tiến trình theo thời gian thực), fallback suy ra từ hour/minute
    let tickAnchorAt: number | null = null;
    if (time.tickUpdatedAt != null) {
      const t = time.tickUpdatedAt instanceof Date ? time.tickUpdatedAt.getTime() : new Date(time.tickUpdatedAt as any).getTime();
      if (!Number.isNaN(t)) tickAnchorAt = t;
    }
    if (tickAnchorAt == null && typeof time.hour === 'number' && typeof time.minute === 'number') {
      const elapsed = ((Math.max(0, Math.min(23, time.hour)) * 60 + Math.max(0, Math.min(59, time.minute))) / (24 * 60)) * GAME_MS_PER_DAY;
      tickAnchorAt = Date.now() - elapsed;
    }
    if (tickAnchorAt == null) tickAnchorAt = s.tickAnchorAt;

    const baseState = { year: nextYear, month: nextMonth, day: dayOfMonth, dayOfYear: nextDayOfYear, hour: s.hour, minute: s.minute, season: nextSeason, tickAnchorAt, isPaused: s.isPaused };
    const { hour, minute, period, holiday } = computeFromAnchor(baseState);
    // Nếu server truyền hour/minute rõ và chưa có anchor chuẩn, ưu tiên giá trị server ngay lần sync đầu
    const useServerHM = tickAnchorAt == null && typeof time.hour === 'number' && typeof time.minute === 'number';
    const finalHour = useServerHM ? (time.hour as number) : hour;
    const finalMinute = useServerHM ? (time.minute as number) : minute;
    const finalPeriod = useServerHM ? (time.period ?? calculateDayPeriod(finalHour)) : period;

    let holidayGiftClaimed = nextYear !== s.year ? {} : s.holidayGiftClaimed;
    let lastHolidayLetter = s.lastHolidayLetter;
    if (holiday) {
      const claimKey = `${nextYear}-${holiday.id}`;
      if (!holidayGiftClaimed[claimKey]) {
        holidayGiftClaimed = { ...holidayGiftClaimed, [claimKey]: true };
        const isTet = holiday.id.includes('tet');
        lastHolidayLetter = {
          title: isTet ? '🧧 THƯ CHÚC TẾT & LÌ XÌ ĐẦU NĂM' : `🏮 THƯ CHÚC MỪNG DỊP LỄ ${holiday.nameVi.toUpperCase()}`,
          sender: isTet ? 'Ủy ban Nhân dân Thành phố & Hiệp hội Doanh nghiệp' : 'Bộ Lao động & Quỹ Phúc lợi Công dân',
          content: isTet
            ? `Nhân dịp Tết Nguyên Đán năm ${nextYear}, kính chúc công dân và gia đình An Khang Thịnh Vượng, Vạn Sự Như Ý! Ủy ban gửi tặng bạn phong bao lì xì may mắn để khởi đầu năm mới hanh thông.`
            : `Nhân dịp kỷ niệm ${holiday.nameVi}, xin gửi tới bạn lời chúc mừng nồng nhiệt cùng khoản tiền thưởng phúc lợi xã hội đã được chuyển vào tài khoản!`,
          bonusCash: isTet ? 2_000_000 : 1_000_000,
        };
      }
    }

    set({
      year: nextYear,
      month: nextMonth,
      day: dayOfMonth,
      dayOfYear: nextDayOfYear,
      hour: finalHour,
      minute: finalMinute,
      season: nextSeason,
      period: finalPeriod,
      activeHoliday: holiday,
      tickAnchorAt,
      holidayGiftClaimed,
      lastHolidayLetter,
    });
  },

  setTimeSpeed: (_speed) => set({ timeSpeed: 1 }),
  togglePause: () => set((state) => {
    const nextPaused = !state.isPaused;
    let tickAnchorAt = state.tickAnchorAt;
    if (tickAnchorAt != null) {
      // Giữ nguyên tiến trình hiển thị khi tạm dừng/tiếp tục
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(GAME_MS_PER_DAY - 1, now - tickAnchorAt));
      if (nextPaused) {
        // đóng băng tại thời điểm hiện tại
        tickAnchorAt = now - elapsed;
      } else {
        // tiếp tục từ tiến trình đã đóng băng
        tickAnchorAt = now - elapsed;
      }
    }
    return { isPaused: nextPaused, tickAnchorAt };
  }),
  setSeason: (season) => set({ season }),
  setWeather: (weather) => set({ weather }), // giữ API tương thích, không cấu hình từ admin

  setGameState: (partial) => set(partial),
  addCash: (delta) => set((state) => ({ cash: Math.max(0, state.cash + delta) })),
  setEnergy: (value) => set({ energy: Math.min(100, Math.max(0, value)) }),
  addHeat: (delta) =>
    set((state) => ({ heatLevel: Math.min(100, Math.max(0, state.heatLevel + delta)) })),
}));
