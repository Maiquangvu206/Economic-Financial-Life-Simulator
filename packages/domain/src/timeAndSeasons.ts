/**
 * Vietnam time, seasons, weather, and labor holiday system.
 */

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonConfig {
  season: Season;
  nameVi: string;
  descriptionVi: string;
  ambientColor: string; // Hex color filter overlay
  energyConsumptionMultiplier: number; // Tác động tiêu hao thể lực
  workerProductivityMultiplier: number; // Tác động năng suất công nhân
}

export const VIETNAM_SEASONS: Record<Season, SeasonConfig> = {
  spring: {
    season: 'spring',
    nameVi: 'Mùa Xuân',
    descriptionVi: 'Thời tiết ấm áp, mưa phùn nhẹ. Năng suất lao động cao sau dịp Tết.',
    ambientColor: 'rgba(52, 211, 153, 0.08)', // Xanh lá nhẹ
    energyConsumptionMultiplier: 0.95,
    workerProductivityMultiplier: 1.1,
  },
  summer: {
    season: 'summer',
    nameVi: 'Mùa Hạ (Hè)',
    descriptionVi: 'Nắng nóng đỉnh điểm, tiêu hao thể lực nhanh, cần quạt/điều hòa xưởng.',
    ambientColor: 'rgba(251, 191, 36, 0.12)', // Vàng cam ấm
    energyConsumptionMultiplier: 1.25,
    workerProductivityMultiplier: 0.9,
  },
  autumn: {
    season: 'autumn',
    nameVi: 'Mùa Thu',
    descriptionVi: 'Mát mẻ dễ chịu, thời tiết thuận lợi nhất cho sản xuất và kinh doanh.',
    ambientColor: 'rgba(249, 115, 22, 0.08)', // Cam thu dịu
    energyConsumptionMultiplier: 1.0,
    workerProductivityMultiplier: 1.05,
  },
  winter: {
    season: 'winter',
    nameVi: 'Mùa Đông',
    descriptionVi: 'Gió mùa Đông Bắc se lạnh, ban đêm tiêu tốn năng lượng sưởi ấm.',
    ambientColor: 'rgba(96, 165, 250, 0.12)', // Xanh dương lạnh
    energyConsumptionMultiplier: 1.15,
    workerProductivityMultiplier: 0.95,
  },
};

export type DayPeriod = 'dawn' | 'day' | 'dusk' | 'night';

export interface DayPeriodInfo {
  period: DayPeriod;
  nameVi: string;
  hourStart: number;
  hourEnd: number;
  ambientFilter: string; // Tailwind/CSS filter overlay
}

export const DAY_PERIODS: DayPeriodInfo[] = [
  {
    period: 'dawn',
    nameVi: 'Rạng sáng',
    hourStart: 4,
    hourEnd: 6,
    ambientFilter: 'rgba(253, 186, 116, 0.18)', // Hồng cam sớm
  },
  {
    period: 'day',
    nameVi: 'Ban ngày',
    hourStart: 6,
    hourEnd: 17,
    ambientFilter: 'rgba(0, 0, 0, 0)', // Trong suốt tự nhiên
  },
  {
    period: 'dusk',
    nameVi: 'Hoàng hôn',
    hourStart: 17,
    hourEnd: 19,
    ambientFilter: 'rgba(234, 88, 12, 0.22)', // Hoàng hôn đỏ cam
  },
  {
    period: 'night',
    nameVi: 'Ban đêm',
    hourStart: 19,
    hourEnd: 4,
    ambientFilter: 'rgba(15, 23, 42, 0.45)', // Đêm tối xanh đen
  },
];

export function getDayPeriod(hour: number): DayPeriodInfo {
  if (hour >= 4 && hour < 6) return DAY_PERIODS[0]!;
  if (hour >= 6 && hour < 17) return DAY_PERIODS[1]!;
  if (hour >= 17 && hour < 19) return DAY_PERIODS[2]!;
  return DAY_PERIODS[3]!;
}

/** Chuẩn thời gian game: 1 ngày game = 1 phút thực tế, 1 năm = 360 ngày (12 tháng x 30 ngày). */
/** Mốc khởi đầu hệ thống: 01/01/2000. */
export const GAME_START_YEAR = 2000;
export const GAME_DAYS_PER_YEAR = 360;
export const GAME_DAYS_PER_MONTH = 30;
export const GAME_TICK_INTERVAL_MS_DEFAULT = 60_000;
export const GAME_MS_PER_DAY = GAME_TICK_INTERVAL_MS_DEFAULT;
export const GAME_MS_PER_MONTH = GAME_DAYS_PER_MONTH * GAME_MS_PER_DAY; // 30 phút thực = 1 tháng game

/** Tính tuổi (năm) từ mốc sinh trong thời gian game. */
export function computeGameAge(params: {
  birthYear: number;
  birthDayOfYear: number; // 0-359
  currentYear: number;
  currentDayOfYear: number; // 0-359
}): number {
  const birthDay = ((Math.floor(params.birthDayOfYear) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  const currentDay = ((Math.floor(params.currentDayOfYear) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  let age = Math.floor(params.currentYear) - Math.floor(params.birthYear);
  if (currentDay < birthDay) age -= 1;
  return Math.max(0, age);
}

/** Tính mốc sinh trong thời gian game từ tuổi khởi tạo tại thời điểm hiện tại. */
export function birthGameTimeForAge(params: {
  age: number;
  currentYear: number;
  currentDayOfYear: number; // 0-359
}): { birthYear: number; birthDayOfYear: number } {
  const currentDay = ((Math.floor(params.currentDayOfYear) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  return {
    birthYear: Math.floor(params.currentYear) - Math.max(0, Math.floor(params.age)),
    birthDayOfYear: currentDay,
  };
}

export function gameDaysToMs(days: number): number {
  return Math.max(0, Math.round(days)) * GAME_MS_PER_DAY;
}

export function gameMonthsToMs(months: number): number {
  return Math.max(0, months) * GAME_MS_PER_MONTH;
}

export interface CanonicalGameTime {
  year: number;
  month: number; // 1-12
  day: number; // 1-30 (ngày trong tháng)
  dayOfYear: number; // 0-359
  hour: number; // 0-23 (ước lượng theo tiến độ tick thực)
  minute: number; // 0-59
  season: Season;
  period: DayPeriod;
}

export function getSeasonByMonth(month: number): Season {
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export interface SeasonRange {
  season: Season;
  startMonth: number; // 1-12
  endMonth: number; // 1-12 (có thể nhỏ hơn startMonth khi mùa vắt qua năm mới, vd 11 -> 1)
}

/** Khoảng thời gian mùa mặc định (theo lịch Việt Nam). */
export const DEFAULT_SEASON_RANGES: SeasonRange[] = [
  { season: 'spring', startMonth: 2, endMonth: 4 },
  { season: 'summer', startMonth: 5, endMonth: 7 },
  { season: 'autumn', startMonth: 8, endMonth: 10 },
  { season: 'winter', startMonth: 11, endMonth: 1 },
];

const SEASON_IDS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

function monthsInRange(startMonth: number, endMonth: number): number[] {
  const months: number[] = [];
  let m = startMonth;
  for (let i = 0; i < 12; i += 1) {
    months.push(m);
    if (m === endMonth) break;
    m = m === 12 ? 1 : m + 1;
  }
  return months;
}

/**
 * Chuẩn hóa & kiểm tra cấu hình khoảng thời gian mùa.
 * Trả về null nếu không hợp lệ (thiếu mùa, trùng tháng, tháng không được gán...).
 */
export function normalizeSeasonRanges(raw: unknown): SeasonRange[] | null {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const bySeason = new Map<Season, SeasonRange>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const season = String((item as any).season ?? '') as Season;
    if (!SEASON_IDS.includes(season)) return null;
    if (bySeason.has(season)) return null;
    const startMonth = Math.round(Number((item as any).startMonth));
    const endMonth = Math.round(Number((item as any).endMonth));
    if (!(startMonth >= 1 && startMonth <= 12) || !(endMonth >= 1 && endMonth <= 12)) return null;
    bySeason.set(season, { season, startMonth, endMonth });
  }
  if (bySeason.size !== 4) return null;

  const assigned = new Array<Season | null>(13).fill(null);
  for (const range of bySeason.values()) {
    for (const m of monthsInRange(range.startMonth, range.endMonth)) {
      if (assigned[m]) return null; // trùng tháng giữa 2 mùa
      assigned[m] = range.season;
    }
  }
  for (let m = 1; m <= 12; m += 1) {
    if (!assigned[m]) return null; // còn tháng chưa được gán mùa
  }
  return SEASON_IDS.map((s) => bySeason.get(s)!);
}

/** Lấy mùa theo tháng, hỗ trợ cấu hình khoảng thời gian mùa tùy chỉnh. */
export function getSeasonByMonthWithRanges(month: number, ranges?: SeasonRange[] | null): Season {
  const list = normalizeSeasonRanges(ranges) ?? DEFAULT_SEASON_RANGES;
  const m = ((Math.floor(month) - 1) % 12 + 12) % 12 + 1;
  for (const range of list) {
    if (monthsInRange(range.startMonth, range.endMonth).includes(m)) return range.season;
  }
  return getSeasonByMonth(m);
}

export function deriveCanonicalGameTime(params: {
  dayOfYear: number;
  year: number;
  tickUpdatedAt?: Date | string | number | null;
  now?: Date | number;
  seasonRanges?: SeasonRange[] | null;
}): CanonicalGameTime {
  const normalizedDay = ((Math.floor(params.dayOfYear) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  const month = Math.floor(normalizedDay / GAME_DAYS_PER_MONTH) + 1;
  const day = (normalizedDay % GAME_DAYS_PER_MONTH) + 1;
  const season = getSeasonByMonthWithRanges(month, params.seasonRanges);

  let hour = 0;
  let minute = 0;
  if (params.tickUpdatedAt != null) {
    const updatedMs = params.tickUpdatedAt instanceof Date ? params.tickUpdatedAt.getTime() : new Date(params.tickUpdatedAt).getTime();
    const nowMs = params.now instanceof Date ? params.now.getTime() : (params.now ?? Date.now());
    if (!Number.isNaN(updatedMs) && !Number.isNaN(nowMs)) {
      const elapsed = Math.max(0, Math.min(GAME_TICK_INTERVAL_MS_DEFAULT - 1, nowMs - updatedMs));
      const totalGameMinutes = Math.floor((elapsed / GAME_TICK_INTERVAL_MS_DEFAULT) * 24 * 60);
      hour = Math.floor(totalGameMinutes / 60) % 24;
      minute = totalGameMinutes % 60;
    }
  }
  const period = getDayPeriod(hour).period;

  return {
    year: Math.max(GAME_START_YEAR, Math.floor(params.year)),
    month,
    day,
    dayOfYear: normalizedDay,
    hour,
    minute,
    season,
    period,
  };
}

/** Hiệu ứng kinh tế/xã hội theo mùa (đơn vị %, 100 = không thay đổi). */
export interface SeasonEffectConfig {
  productivityPct: number; // Năng suất lao động -> thu nhập từ việc làm
  energyPct: number; // Tiêu hao thể lực (càng cao càng hao)
  taxPct: number; // Thuế phải nộp
  revenuePct: number; // Doanh thu (công ty/cho thuê)
}

export type SeasonEffectsMap = Record<Season, SeasonEffectConfig>;

export const DEFAULT_SEASON_EFFECTS: SeasonEffectsMap = {
  spring: { productivityPct: 110, energyPct: 95, taxPct: 100, revenuePct: 100 },
  summer: { productivityPct: 90, energyPct: 125, taxPct: 100, revenuePct: 105 },
  autumn: { productivityPct: 105, energyPct: 100, taxPct: 100, revenuePct: 100 },
  winter: { productivityPct: 95, energyPct: 115, taxPct: 100, revenuePct: 95 },
};

const EFFECT_KEYS = ['productivityPct', 'energyPct', 'taxPct', 'revenuePct'] as const;

/** Chuẩn hóa cấu hình hiệu ứng mùa; trả về null nếu không hợp lệ. */
export function normalizeSeasonEffects(raw: unknown): SeasonEffectsMap | null {
  if (!raw || typeof raw !== 'object') return null;
  const out = {} as SeasonEffectsMap;
  for (const season of SEASON_IDS) {
    const item = (raw as any)[season];
    if (!item || typeof item !== 'object') return null;
    const cfg = {} as SeasonEffectConfig;
    for (const key of EFFECT_KEYS) {
      const value = Math.round(Number(item[key]));
      if (!Number.isFinite(value) || value < 0 || value > 300) return null;
      cfg[key] = value;
    }
    out[season] = cfg;
  }
  return out;
}

/** Hiệu ứng hiệu lực của 1 mùa (multiplier, 1 = không đổi). */
export function resolveSeasonEffects(season: Season, raw?: unknown): {
  productivity: number;
  energy: number;
  tax: number;
  revenue: number;
  config: SeasonEffectConfig;
} {
  const map = normalizeSeasonEffects(raw) ?? DEFAULT_SEASON_EFFECTS;
  const cfg = map[season];
  return {
    productivity: cfg.productivityPct / 100,
    energy: cfg.energyPct / 100,
    tax: cfg.taxPct / 100,
    revenue: cfg.revenuePct / 100,
    config: cfg,
  };
}

export interface VietnamHoliday {
  id: string;
  nameVi: string;
  day: number;
  month: number;
  isDaysOff: boolean;
  otPayMultiplier: number; // Hệ số lương làm thêm ngày lễ (Luật LĐ: tối thiểu 300%)
  productivityBonus: number; // Tác động nếu doanh nghiệp vận hành
}

export const VIETNAM_STANDARD_HOLIDAYS: VietnamHoliday[] = [
  {
    id: 'new_year',
    nameVi: 'Tết Dương Lịch',
    day: 1,
    month: 1,
    isDaysOff: true,
    otPayMultiplier: 3.0,
    productivityBonus: -0.5,
  },
  {
    id: 'tet_holiday',
    nameVi: 'Tết Nguyên Đán (Tết Cổ Truyền)',
    day: 10, // Quy ước tượng trưng
    month: 2,
    isDaysOff: true,
    otPayMultiplier: 3.0,
    productivityBonus: -0.9,
  },
  {
    id: 'hung_kings',
    nameVi: 'Giỗ Tổ Hùng Vương (10/3 ÂL)',
    day: 18,
    month: 4,
    isDaysOff: true,
    otPayMultiplier: 3.0,
    productivityBonus: -0.4,
  },
  {
    id: 'reunification_labor',
    nameVi: 'Giải phóng miền Nam (30/4) & Quốc tế Lao động (1/5)',
    day: 30,
    month: 4,
    isDaysOff: true,
    otPayMultiplier: 3.0,
    productivityBonus: -0.6,
  },
  {
    id: 'national_day',
    nameVi: 'Quốc khánh nước CHXHCN Việt Nam (2/9)',
    day: 2,
    month: 9,
    isDaysOff: true,
    otPayMultiplier: 3.0,
    productivityBonus: -0.5,
  },
];
