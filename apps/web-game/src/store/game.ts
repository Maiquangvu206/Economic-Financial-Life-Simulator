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
  timeSpeed: number; // Hệ số nhân tốc độ: 1x, 2x, 5x, 0 = tạm dừng
  isPaused: boolean;

  // Mùa & Thời tiết
  season: Season;
  period: DayPeriod;
  weather: 'sunny' | 'rainy' | 'storm' | 'cloudy' | 'cold';
  activeHoliday: GameHoliday | null;

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
  tickTime: (deltaMinutes?: number) => void;
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
  { id: 'tet_duong', nameVi: 'Tết Dương Lịch', day: 1, month: 1, isDaysOff: true, otPayMultiplier: 3.0 },
  { id: 'tet_nguyen_dan', nameVi: 'Tết Nguyên Đán', day: 10, month: 2, isDaysOff: true, otPayMultiplier: 3.0 },
  { id: 'hung_kings', nameVi: 'Giỗ Tổ Hùng Vương', day: 18, month: 4, isDaysOff: true, otPayMultiplier: 3.0 },
  { id: 'le_30_4', nameVi: '30/4 - 1/5', day: 30, month: 4, isDaysOff: true, otPayMultiplier: 3.0 },
  { id: 'quoc_khanh', nameVi: 'Quốc khánh 2/9', day: 2, month: 9, isDaysOff: true, otPayMultiplier: 3.0 },
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
  timeSpeed: 1,
  isPaused: false,

  season: 'spring',
  period: 'day',
  weather: 'sunny',
  activeHoliday: null,

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

  tickTime: (deltaMinutes = 5) => {
    const state = get();
    if (state.isPaused) return;

    let { minute, hour, day, month, year } = state;
    minute += deltaMinutes;

    if (minute >= 60) {
      hour += Math.floor(minute / 60);
      minute %= 60;
    }

    if (hour >= 24) {
      day += Math.floor(hour / 24);
      hour %= 24;
    }

    // 30 ngày mỗi tháng chuẩn hoá mô phỏng
    if (day > 30) {
      month += Math.floor((day - 1) / 30);
      day = ((day - 1) % 30) + 1;
    }

    if (month > 12) {
      year += Math.floor((month - 1) / 12);
      month = ((month - 1) % 12) + 1;
    }

    const season = calculateSeason(month);
    const period = calculateDayPeriod(hour);

    const holiday =
      DEFAULT_HOLIDAYS.find((h) => h.day === day && h.month === month) ?? null;

    set({
      minute,
      hour,
      day,
      month,
      year,
      season,
      period,
      activeHoliday: holiday,
    });
  },

  setTimeSpeed: (speed) => set({ timeSpeed: speed }),
  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),
  setSeason: (season) => set({ season }),
  setWeather: (weather) => set({ weather }),
  setGameState: (partial) => set(partial),
  addCash: (delta) => set((state) => ({ cash: Math.max(0, state.cash + delta) })),
  setEnergy: (value) => set({ energy: Math.min(100, Math.max(0, value)) }),
  addHeat: (delta) =>
    set((state) => ({ heatLevel: Math.min(100, Math.max(0, state.heatLevel + delta)) })),
}));
