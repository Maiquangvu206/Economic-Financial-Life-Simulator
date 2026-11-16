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
  // Thời gian thực trong game (tự động trôi)
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
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

export const useGameStore = create<GameState>((set, get) => ({
  year: 2026,
  month: 1,
  day: 15,
  hour: 8,
  minute: 0,
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

  // Tài chính khởi đầu bằng VNĐ
  cash: 15_000_000, // 15 triệu VNĐ
  netWorth: 15_000_000,
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

  tickTime: (deltaMinutes = 24) => {
    const state = get();
    if (state.isPaused) return;

    let { minute, hour, day, month, year, holidayGiftClaimed } = state;
    minute += deltaMinutes;

    if (minute >= 60) {
      hour += Math.floor(minute / 60);
      minute %= 60;
    }

    if (hour >= 24) {
      day += Math.floor(hour / 24);
      hour %= 24;
    }

    // 30 ngày mỗi tháng, 360 ngày/năm (đồng bộ chuẩn hệ thống: 1 ngày game = 1 phút thực)
    if (day > 30) {
      month += Math.floor((day - 1) / 30);
      day = ((day - 1) % 30) + 1;
    }

    if (month > 12) {
      year += Math.floor((month - 1) / 12);
      month = ((month - 1) % 12) + 1;
      // Đầu năm mới reset danh sách nhận quà
      holidayGiftClaimed = {};
    }

    const season = calculateSeason(month);
    const period = calculateDayPeriod(hour);
    const holiday = DEFAULT_HOLIDAYS.find((h) => h.day === day && h.month === month) ?? null;

    let newLetter = state.lastHolidayLetter;

    // Tự động gửi thư chúc mừng & Lì xì Tết / Tiền thưởng Lễ (client-side prompt; claim thực tế qua server)
    if (holiday) {
      const claimKey = `${year}-${holiday.id}`;
      if (!holidayGiftClaimed[claimKey]) {
        holidayGiftClaimed = { ...holidayGiftClaimed, [claimKey]: true };
        const isTet = holiday.id.includes('tet');
        newLetter = {
          title: isTet
            ? '🧧 THƯ CHÚC TẾT & LÌ XÌ ĐẦU NĂM'
            : `🏮 THƯ CHÚC MỪNG DỊP LỄ ${holiday.nameVi.toUpperCase()}`,
          sender: isTet
            ? 'Ủy ban Nhân dân Thành phố & Hiệp hội Doanh nghiệp'
            : 'Bộ Lao động & Quỹ Phúc lợi Công dân',
          content: isTet
            ? `Nhân dịp Tết Nguyên Đán năm ${year}, kính chúc công dân và gia đình An Khang Thịnh Vượng, Vạn Sự Như Ý! Ủy ban gửi tặng bạn phong bao lì xì may mắn để khởi đầu năm mới hanh thông.`
            : `Nhân dịp kỷ niệm ${holiday.nameVi}, xin gửi tới bạn lời chúc mừng nồng nhiệt cùng khoản tiền thưởng phúc lợi xã hội đã được chuyển vào tài khoản!`,
          bonusCash: isTet ? 2_000_000 : 1_000_000,
        };
      }
    }

    set({
      minute,
      hour,
      day,
      month,
      year,
      season,
      period,
      activeHoliday: holiday,
      holidayGiftClaimed,
      lastHolidayLetter: newLetter,
    });
  },

  syncServerTime: (time) => {
    // currentDay từ server là dayOfYear (0-359); ngày trong tháng là currentDayOfMonth (1-30)
    const nextMonth = time.currentMonth ?? get().month;
    const nextYear = time.currentYear ?? get().year;
    const fallbackDayOfMonth = (() => {
      if (typeof time.dayOfYear === 'number') return (Math.floor(time.dayOfYear) % 30) + 1;
      if (typeof time.currentDay === 'number' && time.currentDay >= 0 && time.currentDay <= 359) return (Math.floor(time.currentDay) % 30) + 1;
      return get().day;
    })();
    const dayOfMonth = time.currentDayOfMonth ?? fallbackDayOfMonth;
    const nextHour = typeof time.hour === 'number' ? time.hour : get().hour;
    const nextMinute = typeof time.minute === 'number' ? time.minute : get().minute;
    const nextSeason = time.season ?? calculateSeason(nextMonth);
    const nextPeriod = time.period ?? calculateDayPeriod(nextHour);
    const holiday = DEFAULT_HOLIDAYS.find((h) => h.day === dayOfMonth && h.month === nextMonth) ?? null;
    set((s) => ({
      year: nextYear,
      month: nextMonth,
      day: dayOfMonth,
      hour: nextHour,
      minute: nextMinute,
      season: nextSeason,
      period: nextPeriod,
      activeHoliday: holiday,
      // reset quà năm nếu năm server thay đổi
      holidayGiftClaimed: nextYear !== s.year ? {} : s.holidayGiftClaimed,
    }));
  },

  setTimeSpeed: (_speed) => set({ timeSpeed: 1 }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setSeason: (season) => set({ season }),
  setWeather: (weather) => set({ weather }), // giữ API tương thích, không cấu hình từ admin

  setGameState: (partial) => set(partial),
  addCash: (delta) => set((state) => ({ cash: Math.max(0, state.cash + delta) })),
  setEnergy: (value) => set({ energy: Math.min(100, Math.max(0, value)) }),
  addHeat: (delta) =>
    set((state) => ({ heatLevel: Math.min(100, Math.max(0, state.heatLevel + delta)) })),
}));
