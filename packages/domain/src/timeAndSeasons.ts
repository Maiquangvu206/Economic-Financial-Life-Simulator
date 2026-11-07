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

