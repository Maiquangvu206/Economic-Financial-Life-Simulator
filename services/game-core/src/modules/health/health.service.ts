import { MoneySchema } from '@efls/contracts';
import type {
  ClaimWelfareSupportRequest,
  ClaimWelfareSupportResponse,
  EntertainmentActivityDto,
  HealthWellnessOverviewDto,
  PerformEntertainmentRequest,
  PerformEntertainmentResponse,
  PerformHomeRestResponse,
  PerformMedicalVisitResponse,
  UpdateHealthInsuranceRequest,
  WelfareSupportStatusDto,
} from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';
import { requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund, debitStateFund, getStateFundBalance } from '../../shared/state-fund/stateFund.js';
import { creditInsuranceFund, debitInsuranceFund, getInsuranceFundBalance } from '../../shared/insurance-fund/insuranceFund.js';
import { getCurrentGameTime, gameTimeDto, type GameTimeSnapshot } from '../../shared/game-time/time.js';
import { getActiveTrip } from '../../shared/wellness/activeTrip.js';
import { healthRepository, type InsuranceEnrollmentRow, type WellnessDailyRow } from './health.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount: Math.max(0, Math.round(amount)), currency: 'VND' });
}

const HOME_REST = {
  energyGain: 15,
  durationMinutes: 120,
  dailyLimit: 2,
  cooldownMinutes: 120,
  cost: 0,
};

const MEDICAL = {
  energyGain: 25,
  baseCostMinor: 500_000,
  dailyLimit: 2,
  cooldownMinutes: 180, // 3 giờ game
};

type EntertainmentCatalogItem = {
  code: string;
  name: string;
  description: string;
  costMinor: number;
  durationMinutes: number;
  energyGain: number;
  dailyLimit: number;
  seasonal: boolean;
  seasons: string[] | null;
};

const ENTERTAINMENT_CATALOG: EntertainmentCatalogItem[] = [
  { code: 'park_walk', name: 'Công viên / Dạo chơi', description: 'Đi dạo thư giãn ngoài trời.', costMinor: 20_000, durationMinutes: 60, energyGain: 5, dailyLimit: 3, seasonal: false, seasons: null },
  { code: 'food_cafe', name: 'Ăn uống / Cà phê', description: 'Thưởng thức đồ ăn, đồ uống và trò chuyện.', costMinor: 80_000, durationMinutes: 90, energyGain: 8, dailyLimit: 3, seasonal: false, seasons: null },
  { code: 'arcade', name: 'Arcade', description: 'Giải trí với trò chơi điện tử.', costMinor: 120_000, durationMinutes: 120, energyGain: 10, dailyLimit: 2, seasonal: false, seasons: null },
  { code: 'gym', name: 'Thể thao / Gym', description: 'Vận động tăng cường sức khỏe.', costMinor: 100_000, durationMinutes: 120, energyGain: 12, dailyLimit: 2, seasonal: false, seasons: null },
  { code: 'cinema_music', name: 'Xem phim / Nhạc', description: 'Thư giãn với phim ảnh và âm nhạc.', costMinor: 150_000, durationMinutes: 150, energyGain: 15, dailyLimit: 2, seasonal: false, seasons: null },
  { code: 'spa', name: 'Spa thư giãn', description: 'Chăm sóc và phục hồi cơ thể.', costMinor: 350_000, durationMinutes: 180, energyGain: 20, dailyLimit: 1, seasonal: false, seasons: null },
  { code: 'seasonal_festival', name: 'Lễ hội theo mùa', description: 'Tham gia lễ hội đặc trưng theo mùa.', costMinor: 200_000, durationMinutes: 180, energyGain: 25, dailyLimit: 1, seasonal: true, seasons: null },
];

function periodKey(t: GameTimeSnapshot): string {
  return `${t.year}-${String(t.month).padStart(2, '0')}`;
}

function entertainmentAvailable(item: EntertainmentCatalogItem, season: string): { available: boolean; reason?: string } {
  if (!item.seasonal) return { available: true };
  if (item.seasons && item.seasons.length > 0 && !item.seasons.includes(season)) {
    return { available: false, reason: 'Hoạt động này chỉ mở trong mùa phù hợp.' };
  }
  return { available: true };
}

async function getCharacterRow(db: Db, userId: string) {
  const character = await requireLivingCharacterByUserId(db, userId);
  const r = await db.query<{ birthplace: string | null; birthplace_name: string | null }>(
    `SELECT c.birthplace, p.name AS birthplace_name
     FROM characters c LEFT JOIN provinces p ON p.code = c.birthplace
     WHERE c.id = $1`,
    [character.id],
  ).catch(() => ({ rows: [] as any[] }));
  return {
    ...character,
    birthplace: r.rows[0]?.birthplace ?? (character as any).birthplace ?? null,
    birthplace_name: r.rows[0]?.birthplace_name ?? null,
  };
}

function applyEnergy(current: number, gain: number): number {
  return Math.max(0, Math.min(100, Math.round(Number(current) + gain)));
}

export class HealthService {
  constructor(private readonly repo = healthRepository) {}

  private getMedicalPricing(enrollment: InsuranceEnrollmentRow | null) {
    const insured = !!enrollment?.is_active;
    const discountMinor = insured ? Math.round(MEDICAL.baseCostMinor * 0.5) : 0;
    const paidMinor = Math.max(0, MEDICAL.baseCostMinor - discountMinor);
    return { insured, discountMinor, paidMinor };
  }

  private async buildOverview(userId: string, db: Db): Promise<HealthWellnessOverviewDto> {
    const character = await getCharacterRow(db, userId);
    const time = await getCurrentGameTime(db);
    const activeTrip = await getActiveTrip(db, character.id);
    const [daily, enrollment, hasResidence] = await Promise.all([
      this.repo.getOrCreateDaily(db as any, character.id, time.year, time.dayOfYear).catch(async () => {
        // ensure exists without lock context issues
        await db.query(
          `INSERT INTO character_wellness_daily (character_id, game_year, game_day)
           VALUES ($1,$2,$3) ON CONFLICT (character_id, game_year, game_day) DO NOTHING`,
          [character.id, time.year, time.dayOfYear],
        ).catch(() => null);
        const r = await db.query<any>(
          `SELECT character_id, game_year, game_day, home_rest_count, last_home_rest_minute,
                  medical_count, last_medical_game_year, last_medical_game_day, last_medical_minute,
                  entertainment_counts, unemployment_claimed, low_income_claimed, low_energy_claimed
           FROM character_wellness_daily WHERE character_id = $1 AND game_year = $2 AND game_day = $3`,
          [character.id, time.year, time.dayOfYear],
        ).catch(() => ({ rows: [] as any[] }));
        const row = r.rows[0];
        return row ? {
          character_id: row.character_id, game_year: Number(row.game_year), game_day: Number(row.game_day),
          home_rest_count: Number(row.home_rest_count ?? 0), last_home_rest_minute: row.last_home_rest_minute == null ? null : Number(row.last_home_rest_minute),
          medical_count: Number(row.medical_count ?? 0), last_medical_game_year: row.last_medical_game_year == null ? null : Number(row.last_medical_game_year),
          last_medical_game_day: row.last_medical_game_day == null ? null : Number(row.last_medical_game_day),
          last_medical_minute: row.last_medical_minute == null ? null : Number(row.last_medical_minute),
          entertainment_counts: (row.entertainment_counts && typeof row.entertainment_counts === 'object') ? row.entertainment_counts : {},
          unemployment_claimed: !!row.unemployment_claimed, low_income_claimed: !!row.low_income_claimed, low_energy_claimed: !!row.low_energy_claimed,
        } as WellnessDailyRow : {
          character_id: character.id, game_year: time.year, game_day: time.dayOfYear,
          home_rest_count: 0, last_home_rest_minute: null, medical_count: 0,
          last_medical_game_year: null, last_medical_game_day: null, last_medical_minute: null,
          entertainment_counts: {}, unemployment_claimed: false, low_income_claimed: false, low_energy_claimed: false,
        } as WellnessDailyRow;
      }),
      this.repo.getEnrollment(character.id, db),
      this.repo.hasValidResidence(character.id, db),
    ]);

    const homeRestUsed = Number(daily.home_rest_count ?? 0);
    const homeRestRemaining = Math.max(0, HOME_REST.dailyLimit - homeRestUsed);
    let homeRestCan = hasResidence && homeRestRemaining > 0 && !activeTrip;
    let homeRestReason: string | null = null;
    let nextHomeRestMinute: number | null = null;
    if (!hasResidence) { homeRestCan = false; homeRestReason = 'Bạn cần sở hữu hoặc thuê nhà ở hợp lệ để nghỉ ngơi tại nhà.'; }
    else if (activeTrip) { homeRestCan = false; homeRestReason = 'Bạn đang trong chuyến đi/du lịch, không thể nghỉ ngơi tại nhà.'; }
    else if (homeRestRemaining <= 0) { homeRestCan = false; homeRestReason = 'Bạn đã dùng hết lượt nghỉ ngơi tại nhà trong ngày game.'; }
    else if (daily.last_home_rest_minute != null) {
      const diff = time.minuteOfDay - Number(daily.last_home_rest_minute);
      if (diff >= 0 && diff < HOME_REST.cooldownMinutes) {
        homeRestCan = false;
        nextHomeRestMinute = Number(daily.last_home_rest_minute) + HOME_REST.cooldownMinutes;
        homeRestReason = 'Chưa hết thời gian hồi giữa 2 lần nghỉ ngơi (2 giờ game).';
      }
    }

    const medicalPricing = this.getMedicalPricing(enrollment);
    const medicalUsed = Number(daily.medical_count ?? 0);
    const medicalRemaining = Math.max(0, MEDICAL.dailyLimit - medicalUsed);
    let medicalCan = medicalRemaining > 0 && !activeTrip;
    let medicalReason: string | null = null;
    if (activeTrip) { medicalCan = false; medicalReason = 'Bạn đang trong chuyến đi/du lịch.'; }
    else if (medicalRemaining <= 0) { medicalCan = false; medicalReason = 'Bạn đã dùng hết lượt khám chữa bệnh trong ngày game.'; }
    else if (daily.last_medical_minute != null) {
      const sameDay = Number(daily.last_medical_game_year) === time.year && Number(daily.last_medical_game_day) === time.dayOfYear;
      if (sameDay) {
        const diff = time.minuteOfDay - Number(daily.last_medical_minute);
        if (diff >= 0 && diff < MEDICAL.cooldownMinutes) {
          medicalCan = false;
          medicalReason = 'Chưa hết thời gian hồi giữa 2 lần khám chữa bệnh.';
        }
      }
    }

    const pKey = periodKey(time);
    const employed = await this.repo.hasActiveEmployment(character.id, db);
    const periodIncome = await this.repo.getPeriodIncomeMinor(character.id, pKey, db).catch(() => 0);
    const insuredActive = !!enrollment?.is_active;
    const lowIncomeThreshold = 3_000_000;
    const supportDefs: Array<{ type: 'unemployment'|'low_income'|'low_energy'; label: string; eligible: boolean; base: number; reason?: string }> = [
      { type: 'unemployment', label: 'Trợ cấp thất nghiệp', eligible: !employed, base: insuredActive ? 1_300_000 : 1_000_000, reason: employed ? 'Bạn đang có việc làm.' : undefined },
      { type: 'low_income', label: 'Trợ cấp thu nhập thấp', eligible: employed && periodIncome < lowIncomeThreshold, base: 800_000, reason: !employed ? 'Áp dụng cho người có việc làm nhưng thu nhập thấp trong kỳ.' : (periodIncome >= lowIncomeThreshold ? 'Thu nhập kỳ hiện tại chưa thuộc mức thấp.' : undefined) },
      { type: 'low_energy', label: 'Trợ cấp thể lực thấp', eligible: Number(character.health_energy) < 25, base: 600_000, reason: Number(character.health_energy) >= 25 ? 'Thể lực hiện tại không dưới 25.' : undefined },
    ];
    const supports: WelfareSupportStatusDto[] = [];
    for (const s of supportDefs) {
      const claimed = await this.repo.hasSupportClaim(character.id, s.type, pKey, db).catch(() => false);
      supports.push({
        type: s.type,
        label: s.label,
        eligible: s.eligible && !!character.birthplace,
        claimedThisPeriod: claimed,
        periodKey: pKey,
        estimatedAmount: money(s.base),
        reason: !character.birthplace ? 'Không xác định được nơi sinh để hưởng an sinh.' : (s.reason ?? null),
      });
    }

    const entCounts = (daily.entertainment_counts ?? {}) as Record<string, number>;
    const entertainment: EntertainmentActivityDto[] = ENTERTAINMENT_CATALOG.map((item) => {
      const used = Number(entCounts[item.code] ?? 0);
      const remaining = Math.max(0, item.dailyLimit - used);
      const avail = entertainmentAvailable(item, time.season);
      let available = avail.available && remaining > 0 && !activeTrip;
      let unavailableReason: string | null = avail.reason ?? null;
      if (activeTrip) { available = false; unavailableReason = 'Bạn đang trong chuyến đi/du lịch.'; }
      else if (remaining <= 0) { available = false; unavailableReason = 'Đã hết lượt trong ngày game.'; }
      return {
        code: item.code,
        name: item.name,
        description: item.description,
        cost: money(item.costMinor),
        durationMinutes: item.durationMinutes,
        energyGain: item.energyGain,
        dailyLimit: item.dailyLimit,
        usedToday: used,
        remainingToday: remaining,
        available,
        unavailableReason,
        seasonal: item.seasonal,
        season: item.seasonal ? time.season : null,
      };
    });

    return {
      healthEnergy: Number(character.health_energy),
      isAlive: character.is_alive !== false,
      birthProvinceCode: (character as any).birthplace ?? null,
      birthProvinceName: (character as any).birthplace_name ?? null,
      inActiveTrip: !!activeTrip,
      activeTripId: activeTrip?.id ?? null,
      gameTime: gameTimeDto(time),
      daily: {
        gameYear: time.year,
        gameDay: time.dayOfYear,
        homeRestCount: homeRestUsed,
        homeRestRemaining,
        medicalCount: medicalUsed,
        medicalRemaining,
        lastHomeRestMinute: daily.last_home_rest_minute == null ? null : Number(daily.last_home_rest_minute),
        lastMedicalMinute: daily.last_medical_minute == null ? null : Number(daily.last_medical_minute),
        entertainmentCounts: entCounts,
      },
      insurance: enrollment ? {
        isActive: !!enrollment.is_active,
        contributionRatePct: Number(enrollment.contribution_rate_pct ?? 0),
        isMandatory: !!enrollment.is_mandatory,
        enrolledGameYear: Number(enrollment.enrolled_game_year),
        enrolledGameDay: Number(enrollment.enrolled_game_day),
        updatedAt: enrollment.updated_at ? new Date(enrollment.updated_at).toISOString() : null,
      } : null,
      homeRest: {
        canRest: homeRestCan,
        reason: homeRestReason,
        energyGain: HOME_REST.energyGain,
        cost: money(HOME_REST.cost),
        durationMinutes: HOME_REST.durationMinutes,
        dailyLimit: HOME_REST.dailyLimit,
        usedToday: homeRestUsed,
        cooldownMinutes: HOME_REST.cooldownMinutes,
        nextAvailableMinute: nextHomeRestMinute,
        hasValidResidence: hasResidence,
      },
      medical: {
        energyGain: MEDICAL.energyGain,
        baseCost: money(MEDICAL.baseCostMinor),
        discountedCost: money(medicalPricing.paidMinor),
        dailyLimit: MEDICAL.dailyLimit,
        cooldownMinutes: MEDICAL.cooldownMinutes,
        canUse: medicalCan,
        reason: medicalReason,
        usedToday: medicalUsed,
        remainingToday: medicalRemaining,
      },
      supports,
      entertainment,
    };
  }

  async getOverview(userId: string): Promise<HealthWellnessOverviewDto> {
    return withTransaction(async (client) => this.buildOverview(userId, client));
  }

  async updateInsurance(userId: string, body: UpdateHealthInsuranceRequest): Promise<HealthWellnessOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const rate = body.isActive ? Math.max(1, Math.min(50, Math.round(Number(body.contributionRatePct ?? 5)))) : 0;
      await this.repo.upsertEnrollment(client, {
        characterId: character.id,
        isActive: !!body.isActive,
        contributionRatePct: body.isActive ? rate : (await this.repo.getEnrollment(character.id, client))?.contribution_rate_pct as any ?? 0,
        isMandatory: false,
        gameYear: time.year,
        gameDay: time.dayOfYear,
      });
      return this.buildOverview(userId, client);
    });
  }

  async performHomeRest(userId: string): Promise<PerformHomeRestResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const activeTrip = await getActiveTrip(client, character.id);
      if (activeTrip) throw AppError.conflict('active_trip', 'Bạn đang trong chuyến đi/du lịch, không thể nghỉ ngơi tại nhà.');
      const hasResidence = await this.repo.hasValidResidence(character.id, client);
      if (!hasResidence) throw AppError.badRequest('Bạn cần sở hữu hoặc thuê nhà ở hợp lệ để nghỉ ngơi tại nhà.');
      const daily = await this.repo.getOrCreateDaily(client, character.id, time.year, time.dayOfYear);
      if (daily.home_rest_count >= HOME_REST.dailyLimit) throw AppError.conflict('rest_limit', 'Bạn đã dùng hết 2 lượt nghỉ ngơi tại nhà trong ngày game.');
      if (daily.last_home_rest_minute != null) {
        const diff = time.minuteOfDay - Number(daily.last_home_rest_minute);
        if (diff >= 0 && diff < HOME_REST.cooldownMinutes) {
          throw AppError.conflict('rest_cooldown', 'Chưa hết thời gian hồi giữa 2 lần nghỉ ngơi (2 giờ game).');
        }
      }
      const newEnergy = applyEnergy(Number(character.health_energy), HOME_REST.energyGain);
      await client.query(`UPDATE characters SET health_energy = $2, updated_at = now() WHERE id = $1`, [character.id, newEnergy]);
      daily.home_rest_count += 1;
      daily.last_home_rest_minute = time.minuteOfDay;
      await this.repo.saveDaily(client, daily);
      const remaining = Math.max(0, HOME_REST.dailyLimit - daily.home_rest_count);
      return {
        ok: true,
        healthEnergy: newEnergy,
        energyGain: HOME_REST.energyGain,
        usedToday: daily.home_rest_count,
        remainingToday: remaining,
        message: `Bạn đã nghỉ ngơi tại nhà và hồi ${HOME_REST.energyGain} thể lực.`,
      };
    });
  }

  async performMedicalVisit(userId: string): Promise<PerformMedicalVisitResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const activeTrip = await getActiveTrip(client, character.id);
      if (activeTrip) throw AppError.conflict('active_trip', 'Bạn đang trong chuyến đi/du lịch, không thể khám chữa bệnh lúc này.');
      const [daily, enrollment] = await Promise.all([
        this.repo.getOrCreateDaily(client, character.id, time.year, time.dayOfYear),
        this.repo.getEnrollment(character.id, client),
      ]);
      if (daily.medical_count >= MEDICAL.dailyLimit) throw AppError.conflict('medical_limit', 'Bạn đã dùng hết lượt khám chữa bệnh trong ngày game.');
      if (daily.last_medical_minute != null && Number(daily.last_medical_game_year) === time.year && Number(daily.last_medical_game_day) === time.dayOfYear) {
        const diff = time.minuteOfDay - Number(daily.last_medical_minute);
        if (diff >= 0 && diff < MEDICAL.cooldownMinutes) {
          throw AppError.conflict('medical_cooldown', 'Chưa hết thời gian hồi giữa 2 lần khám chữa bệnh.');
        }
      }
      const pricing = this.getMedicalPricing(enrollment);
      const balance = await ledger.getBalance(client as any, 'character', character.id);
      if (balance < pricing.paidMinor) {
        throw AppError.conflict('insufficient_funds', `Không đủ tiền khám chữa bệnh. Cần ${pricing.paidMinor.toLocaleString('vi-VN')} ₫.`);
      }
      if (pricing.paidMinor > 0) {
        await ledger.transfer(client as any, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          amountMinor: pricing.paidMinor,
          kind: 'medical_visit',
          description: `Khám chữa bệnh hồi thể lực (${pricing.insured ? 'có bảo hiểm' : 'không bảo hiểm'})`,
          referenceType: 'medical_visit',
          referenceId: character.id,
        });
      }
      const newEnergy = applyEnergy(Number(character.health_energy), MEDICAL.energyGain);
      await client.query(`UPDATE characters SET health_energy = $2, updated_at = now() WHERE id = $1`, [character.id, newEnergy]);
      daily.medical_count += 1;
      daily.last_medical_game_year = time.year;
      daily.last_medical_game_day = time.dayOfYear;
      daily.last_medical_minute = time.minuteOfDay;
      await this.repo.saveDaily(client, daily);
      await client.query(
        `INSERT INTO medical_visits (character_id, game_year, game_day, minute_of_day, base_cost_minor, discount_minor, paid_minor, used_insurance, energy_gain)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [character.id, time.year, time.dayOfYear, time.minuteOfDay, MEDICAL.baseCostMinor, pricing.discountMinor, pricing.paidMinor, pricing.insured, MEDICAL.energyGain],
      ).catch(() => null);
      return {
        ok: true,
        healthEnergy: newEnergy,
        energyGain: MEDICAL.energyGain,
        baseCost: money(MEDICAL.baseCostMinor),
        discount: money(pricing.discountMinor),
        paid: money(pricing.paidMinor),
        usedInsurance: pricing.insured,
        message: `Khám chữa bệnh thành công, hồi ${MEDICAL.energyGain} thể lực.`,
      };
    });
  }

  async claimSupport(userId: string, body: ClaimWelfareSupportRequest): Promise<ClaimWelfareSupportResponse> {
    return withTransaction(async (client) => {
      const character = await getCharacterRow(client, userId);
      const time = await getCurrentGameTime(client);
      if (!character.birthplace) throw AppError.badRequest('Không xác định được nơi sinh để nhận trợ cấp.');
      const pKey = periodKey(time);
      const claimed = await this.repo.hasSupportClaim(character.id, body.supportType, pKey, client);
      if (claimed) throw AppError.conflict('support_claimed', 'Bạn đã nhận trợ cấp này trong kỳ hiện tại.');

      const enrollment = await this.repo.getEnrollment(character.id, client);
      const insured = !!enrollment?.is_active;
      const employed = await this.repo.hasActiveEmployment(character.id, client);
      const periodIncome = await this.repo.getPeriodIncomeMinor(character.id, pKey, client).catch(() => 0);
      let base = 0;
      let eligible = false;
      if (body.supportType === 'unemployment') { eligible = !employed; base = insured ? 1_300_000 : 1_000_000; }
      else if (body.supportType === 'low_income') { eligible = employed && periodIncome < 3_000_000; base = 800_000; }
      else if (body.supportType === 'low_energy') { eligible = Number(character.health_energy) < 25; base = 600_000; }
      if (!eligible) throw AppError.badRequest('Bạn chưa đủ điều kiện nhận trợ cấp này trong kỳ hiện tại.');

      const amount = base;
      let fromInsurance = 0;
      let fromState = 0;
      // Kết hợp quỹ: ưu tiên quỹ bảo hiểm đóng góp một phần khi có tham gia, phần còn lại từ quỹ đất nước
      const insuranceShareTarget = insured ? Math.min(amount, Math.round(amount * 0.5)) : Math.min(amount, Math.round(amount * 0.2));
      const insBal = await getInsuranceFundBalance(client).catch(() => 0);
      fromInsurance = Math.min(insuranceShareTarget, Math.max(0, insBal));
      fromState = amount - fromInsurance;
      const stateBal = await getStateFundBalance(client).catch(() => 0);
      if (fromState > stateBal) {
        // try shift more to insurance if possible
        const extra = Math.min(fromState - stateBal, Math.max(0, insBal - fromInsurance));
        fromInsurance += extra;
        fromState -= extra;
      }
      if (fromState > (await getStateFundBalance(client).catch(() => 0))) {
        throw AppError.conflict('fund_insufficient', 'Nguồn quỹ an sinh hiện không đủ để chi trả trợ cấp.');
      }

      if (fromInsurance > 0) {
        await debitInsuranceFund(client, { ownerType: 'character', ownerId: character.id, kind: 'cash' }, fromInsurance, {
          amountMinor: -fromInsurance,
          reasonCode: `welfare_support_${body.supportType}`,
          description: `Chi trợ cấp ${body.supportType} (${pKey}) từ quỹ bảo hiểm`,
          refType: 'welfare_support',
          refId: character.id,
          actorType: 'system',
          ledgerKind: 'welfare_support',
          ledgerDescription: `Trợ cấp ${body.supportType} (quỹ bảo hiểm)`,
        });
      }
      if (fromState > 0) {
        await debitStateFund(client, { ownerType: 'character', ownerId: character.id, kind: 'cash' }, fromState, {
          amountMinor: -fromState,
          reasonCode: `welfare_support_${body.supportType}`,
          description: `Chi trợ cấp ${body.supportType} (${pKey}) từ quỹ đất nước`,
          refType: 'welfare_support',
          refId: character.id,
          actorType: 'system',
          ledgerKind: 'welfare_support',
          ledgerDescription: `Trợ cấp ${body.supportType} (quỹ đất nước)`,
        });
      }

      await client.query(
        `INSERT INTO welfare_support_claims
           (character_id, support_type, period_key, game_year, game_day, birth_province_code, amount_minor, insurance_bonus_applied, source_state_minor, source_insurance_minor)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [character.id, body.supportType, pKey, time.year, time.dayOfYear, character.birthplace, amount, insured && body.supportType === 'unemployment', fromState, fromInsurance],
      ).catch((e) => { throw e; });

      return {
        ok: true,
        supportType: body.supportType,
        periodKey: pKey,
        amount: money(amount),
        insuranceBonusApplied: insured && body.supportType === 'unemployment',
        paidFromStateFund: money(fromState),
        paidFromInsuranceFund: money(fromInsurance),
        message: `Đã nhận trợ cấp kỳ ${pKey}.`,
      };
    });
  }

  async performEntertainment(userId: string, body: PerformEntertainmentRequest): Promise<PerformEntertainmentResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const activeTrip = await getActiveTrip(client, character.id);
      if (activeTrip) throw AppError.conflict('active_trip', 'Bạn đang trong chuyến đi/du lịch, không thể tham gia giải trí lúc này.');
      const item = ENTERTAINMENT_CATALOG.find((x) => x.code === body.activityCode);
      if (!item) throw AppError.badRequest('Hoạt động giải trí không hợp lệ.');
      const avail = entertainmentAvailable(item, time.season);
      if (!avail.available) throw AppError.badRequest(avail.reason ?? 'Hoạt động hiện không khả dụng.');

      const daily = await this.repo.getOrCreateDaily(client, character.id, time.year, time.dayOfYear);
      const counts = { ...(daily.entertainment_counts ?? {}) } as Record<string, number>;
      const used = Number(counts[item.code] ?? 0);
      if (used >= item.dailyLimit) throw AppError.conflict('entertainment_limit', 'Bạn đã hết lượt hoạt động này trong ngày game.');

      const costMinor = item.costMinor;
      const balance = await ledger.getBalance(client as any, 'character', character.id);
      if (balance < costMinor) throw AppError.conflict('insufficient_funds', `Không đủ tiền tham gia hoạt động. Cần ${costMinor.toLocaleString('vi-VN')} ₫.`);
      if (costMinor > 0) {
        await ledger.transfer(client as any, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          amountMinor: costMinor,
          kind: 'entertainment',
          description: `Giải trí: ${item.name}`,
          referenceType: 'entertainment',
          referenceId: character.id,
        });
      }
      const newEnergy = applyEnergy(Number(character.health_energy), item.energyGain);
      await client.query(`UPDATE characters SET health_energy = $2, updated_at = now() WHERE id = $1`, [character.id, newEnergy]);
      counts[item.code] = used + 1;
      daily.entertainment_counts = counts;
      await this.repo.saveDaily(client, daily);
      await client.query(
        `INSERT INTO entertainment_logs (character_id, activity_code, game_year, game_day, minute_of_day, cost_minor, duration_minutes, energy_gain, seasonal, season)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [character.id, item.code, time.year, time.dayOfYear, time.minuteOfDay, costMinor, item.durationMinutes, item.energyGain, item.seasonal, item.seasonal ? time.season : null],
      ).catch(() => null);
      const usedNow = counts[item.code] ?? 0;
      return {
        ok: true,
        activityCode: item.code,
        activityName: item.name,
        healthEnergy: newEnergy,
        energyGain: item.energyGain,
        cost: money(costMinor),
        usedToday: usedNow,
        remainingToday: Math.max(0, item.dailyLimit - usedNow),
        message: `Bạn đã tham gia ${item.name} và hồi ${item.energyGain} thể lực.`,
      };
    });
  }
}

export const healthService = new HealthService();
