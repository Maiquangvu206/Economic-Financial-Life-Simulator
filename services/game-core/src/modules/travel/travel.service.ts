import { MoneySchema, type LodgingOptionDto, type StartRetreatTripRequest, type StartRetreatTripResponse, type StartShortTripRequest, type StartShortTripResponse, type TravelDestinationDto, type TravelOverviewDto, type TravelTripDto } from '@efls/contracts';
import { GAME_DAYS_PER_YEAR } from '@efls/domain';
import { AppError } from '../../shared/http/errors.js';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { getCurrentGameTime, type GameTimeSnapshot } from '../../shared/game-time/time.js';
import { getActiveTrip } from '../../shared/wellness/activeTrip.js';
import { travelRepository, type TravelTripRow, type PlayerLodgingRow } from './travel.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount: Math.max(0, Math.round(amount)), currency: 'VND' });
}

function absDay(year: number, dayOfYear: number): number {
  const d = ((Math.floor(dayOfYear) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  return Math.floor(year) * GAME_DAYS_PER_YEAR + d;
}

function fromAbs(abs: number): { year: number; dayOfYear: number } {
  const year = Math.floor(abs / GAME_DAYS_PER_YEAR);
  const dayOfYear = ((abs % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  return { year, dayOfYear };
}

function isPeakTourismSeason(season: string): boolean {
  return season === 'summer';
}

function peakMultiplier(season: string): number {
  return isPeakTourismSeason(season) ? 1.4 : 1.0;
}

function retreatEnergy(days: number): number {
  if (days <= 1) return 40;
  if (days === 2) return 50;
  return 60;
}

function shortTripBaseTicket(): number { return 200_000; }
function retreatBaseTicket(days: number): number { return 250_000 + days * 150_000; }
function npcHotelBasePerDay(): number { return 400_000; }

function tripDto(row: TravelTripRow): TravelTripDto {
  return {
    id: row.id,
    provinceCode: row.province_code,
    provinceName: row.province_name,
    tripKind: row.trip_kind as any,
    status: row.status as any,
    startGameYear: Number(row.start_game_year),
    startGameDay: Number(row.start_game_day),
    endGameYear: Number(row.end_game_year),
    endGameDay: Number(row.end_game_day),
    durationDays: Number(row.duration_days ?? 0),
    isPeakSeason: !!row.is_peak_season,
    priceMultiplier: Number(row.price_multiplier ?? 1),
    ticketCost: money(Number(row.ticket_cost_minor ?? 0)),
    lodgingCost: money(Number(row.lodging_cost_minor ?? 0)),
    totalCost: money(Number(row.total_cost_minor ?? 0)),
    energyReward: Number(row.energy_reward ?? 0),
    rewardApplied: !!row.reward_applied,
    lodgingType: (row.lodging_type as any) ?? 'none',
    lodgingPropertyId: row.lodging_property_id,
    lodgingPropertySource: row.lodging_property_source,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  };
}

function destinationDto(p: { code: string; name: string; region: string; is_city: boolean }, season: string): TravelDestinationDto {
  const mult = peakMultiplier(season);
  const peak = isPeakTourismSeason(season);
  return {
    provinceCode: p.code,
    provinceName: p.name,
    region: p.region,
    isCity: !!p.is_city,
    isPeakSeason: peak,
    season,
    priceMultiplier: mult,
    shortTripTicket: money(Math.round(shortTripBaseTicket() * mult)),
    shortTripEnergy: 15,
    retreatEnergyByDays: { '1': 40, '2': 50, '3': 60 },
  };
}

export class TravelService {
  constructor(private readonly repo = travelRepository) {}

  async getOverview(userId: string): Promise<TravelOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const [active, history, provinces] = await Promise.all([
        this.repo.getActiveTrip(character.id, client),
        this.repo.listHistory(character.id, 15, client),
        this.repo.listProvinces(client),
      ]);
      return {
        inActiveTrip: !!active,
        activeTrip: active ? tripDto(active) : null,
        destinations: provinces.map((p) => destinationDto(p, time.season)),
        history: history.map(tripDto),
        gameTime: {
          year: time.year,
          month: time.month,
          day: time.day,
          dayOfYear: time.dayOfYear,
          hour: time.hour,
          minute: time.minute,
          season: time.season,
        },
      };
    });
  }

  async startShortTrip(userId: string, body: StartShortTripRequest): Promise<StartShortTripResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const active = await getActiveTrip(client, character.id);
      if (active) throw AppError.conflict('active_trip', 'Bạn đang trong chuyến đi/du lịch.');
      const province = await this.repo.getProvince(body.provinceCode, client);
      if (!province) throw AppError.notFound('Tỉnh/thành');

      const mult = peakMultiplier(time.season);
      const ticket = Math.round(shortTripBaseTicket() * mult);
      const total = ticket;
      const balance = await ledger.getBalance(client as any, 'character', character.id);
      if (balance < total) throw AppError.conflict('insufficient_funds', `Không đủ tiền cho chuyến du lịch ngắn. Cần ${total.toLocaleString('vi-VN')} ₫.`);

      if (total > 0) {
        await ledger.transfer(client as any, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          amountMinor: total,
          kind: 'travel_short',
          description: `Du lịch ngắn tại ${province.name}`,
          referenceType: 'travel_trip',
          referenceId: character.id,
        });
      }

      const newEnergy = Math.max(0, Math.min(100, Number(character.health_energy) + 15));
      await client.query(`UPDATE characters SET health_energy = $2, updated_at = now() WHERE id = $1`, [character.id, newEnergy]);

      const row = await this.repo.insertTrip(client, {
        characterId: character.id,
        provinceCode: province.code,
        provinceName: province.name,
        tripKind: 'short',
        status: 'completed',
        startYear: time.year,
        startDay: time.dayOfYear,
        startAbs: time.absDay,
        endYear: time.year,
        endDay: time.dayOfYear,
        endAbs: time.absDay,
        durationDays: 0,
        isPeakSeason: isPeakTourismSeason(time.season),
        priceMultiplier: mult,
        ticketCostMinor: ticket,
        lodgingCostMinor: 0,
        totalCostMinor: total,
        energyReward: 15,
        lodgingType: 'none',
        paidOut: true,
        rewardApplied: true,
        completedAt: new Date(),
      });

      return {
        ok: true,
        trip: tripDto(row),
        healthEnergy: newEnergy,
        energyGain: 15,
        totalCost: money(total),
        message: `Bạn đã có chuyến du lịch ngắn tại ${province.name} và hồi 15 thể lực.`,
      };
    });
  }

  async getLodgingOptions(userId: string, provinceCode: string, days: number): Promise<LodgingOptionDto[]> {
    return withTransaction(async (client) => {
      await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const province = await this.repo.getProvince(provinceCode, client);
      if (!province) throw AppError.notFound('Tỉnh/thành');
      const d = Math.max(1, Math.min(3, Math.floor(days)));
      const mult = peakMultiplier(time.season);

      const options: LodgingOptionDto[] = [];
      const npcPerDay = Math.round(npcHotelBasePerDay() * mult);
      options.push({
        id: `npc_hotel:${province.code}`,
        type: 'npc_hotel',
        name: `Khách sạn NPC - ${province.name}`,
        provinceCode: province.code,
        perDayCost: money(npcPerDay),
        totalCost: money(npcPerDay * d),
        description: 'Lưu trú tại khách sạn hệ thống (NPC).',
        ownerCharacterId: null,
        ownerName: null,
        propertyId: null,
        propertySource: null,
      });

      const playerProps = await this.repo.listPlayerLodgingOptions(province.code, client);
      const meRow = await client.query<{ id: string }>(`SELECT id FROM characters WHERE user_id = $1 LIMIT 1`, [userId]);
      const myId = meRow.rows[0]?.id ?? null;
      for (const p of playerProps) {
        if (myId && p.owner_character_id === myId) continue; // không thuê BĐS của chính mình
        const monthly = Math.max(0, Number(p.monthly_rent_minor ?? 0));
        const perDayBase = Math.max(150_000, Math.round(monthly / 30));
        const perDay = Math.round(perDayBase * mult);
        options.push({
          id: `player_property:province_land:${p.property_id}`,
          type: 'player_property',
          name: p.name || `BĐS cho thuê - ${province.name}`,
          provinceCode: province.code,
          perDayCost: money(perDay),
          totalCost: money(perDay * d),
          description: `BĐS cho thuê của người chơi (${p.property_type}).`,
          ownerCharacterId: p.owner_character_id,
          ownerName: p.owner_name,
          propertyId: p.property_id,
          propertySource: p.source,
        });
      }
      return options;
    });
  }

  async startRetreat(userId: string, body: StartRetreatTripRequest): Promise<StartRetreatTripResponse> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const time = await getCurrentGameTime(client);
      const active = await getActiveTrip(client, character.id);
      if (active) throw AppError.conflict('active_trip', 'Bạn đang trong chuyến đi/du lịch.');

      const days = Math.max(1, Math.min(3, Math.floor(body.days)));
      const province = await this.repo.getProvince(body.provinceCode, client);
      if (!province) throw AppError.notFound('Tỉnh/thành');

      const mult = peakMultiplier(time.season);
      const ticket = Math.round(retreatBaseTicket(days) * mult);
      let lodgingCost = 0;
      let lodgingType: 'npc_hotel'|'player_property'|'none' = 'npc_hotel';
      let lodgingPropertySource: string | null = null;
      let lodgingPropertyId: string | null = null;
      let lodgingOwnerId: string | null = null;

      if (body.lodgingType === 'npc_hotel' || !body.lodgingType) {
        lodgingType = 'npc_hotel';
        lodgingCost = Math.round(npcHotelBasePerDay() * mult) * days;
      } else if (body.lodgingType === 'player_property') {
        lodgingType = 'player_property';
        // resolve option
        const propId = body.propertyId ?? (body.lodgingOptionId?.startsWith('player_property:province_land:') ? body.lodgingOptionId.split(':').pop() : null);
        if (!propId) throw AppError.badRequest('Vui lòng chọn BĐS cho thuê hợp lệ.');
        const prop = await client.query<any>(
          `SELECT pl.id, pl.province_code, pl.owner_character_id, COALESCE(pl.monthly_rent_minor,0)::text AS monthly_rent_minor,
                  COALESCE(pl.rent_listing_active,false) AS rent_listing_active, pl.status, pl.merged_into_property_id
           FROM province_land_properties pl
           WHERE pl.id = $1
           FOR UPDATE`,
          [propId],
        ).then(r => r.rows[0]).catch(() => null);
        if (!prop) throw AppError.notFound('BĐS lưu trú');
        if (prop.province_code !== province.code) throw AppError.badRequest('BĐS lưu trú không thuộc tỉnh/thành đã chọn.');
        if (!prop.owner_character_id || prop.status !== 'owned' || !prop.rent_listing_active || prop.merged_into_property_id) {
          throw AppError.badRequest('BĐS này hiện không khả dụng để lưu trú.');
        }
        if (prop.owner_character_id === character.id) throw AppError.badRequest('Bạn không thể thuê lưu trú tại BĐS của chính mình.');
        const monthly = Math.max(0, Number(prop.monthly_rent_minor ?? 0));
        const perDay = Math.round(Math.max(150_000, Math.round(monthly / 30)) * mult);
        lodgingCost = perDay * days;
        lodgingPropertySource = 'province_land';
        lodgingPropertyId = prop.id;
        lodgingOwnerId = prop.owner_character_id;
      } else if (body.lodgingType === 'none') {
        lodgingType = 'none';
        lodgingCost = 0;
      } else {
        throw AppError.badRequest('Loại lưu trú không hợp lệ.');
      }

      const total = ticket + lodgingCost;
      const balance = await ledger.getBalance(client as any, 'character', character.id);
      if (balance < total) throw AppError.conflict('insufficient_funds', `Không đủ tiền cho chuyến nghỉ dưỡng. Cần ${total.toLocaleString('vi-VN')} ₫.`);

      // Charge traveler upfront: ticket + NPC lodging to market; player lodging to owner
      if (ticket > 0) {
        await ledger.transfer(client as any, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          amountMinor: ticket,
          kind: 'travel_ticket',
          description: `Vé nghỉ dưỡng tại ${province.name} (${days} ngày)`,
          referenceType: 'travel_trip',
          referenceId: character.id,
        });
      }
      if (lodgingCost > 0) {
        if (lodgingType === 'player_property' && lodgingOwnerId) {
          await ledger.transfer(client as any, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'character', ownerId: lodgingOwnerId },
            amountMinor: lodgingCost,
            kind: 'travel_lodging_player',
            description: `Doanh thu lưu trú nghỉ dưỡng tại ${province.name} (${days} ngày)`,
            referenceType: 'travel_trip',
            referenceId: lodgingPropertyId ?? character.id,
          });
        } else if (lodgingType === 'npc_hotel') {
          await ledger.transfer(client as any, {
            from: { ownerType: 'character', ownerId: character.id },
            to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
            amountMinor: lodgingCost,
            kind: 'travel_lodging_npc',
            description: `Lưu trú khách sạn NPC tại ${province.name} (${days} ngày)`,
            referenceType: 'travel_trip',
            referenceId: character.id,
          });
        }
      }

      const startAbs = time.absDay;
      const endAbs = startAbs + days; // kết thúc sau N ngày game, hoàn tất ở tick của endAbs
      const end = fromAbs(endAbs);
      const energyReward = retreatEnergy(days);

      const row = await this.repo.insertTrip(client, {
        characterId: character.id,
        provinceCode: province.code,
        provinceName: province.name,
        tripKind: 'retreat',
        status: 'active',
        startYear: time.year,
        startDay: time.dayOfYear,
        startAbs,
        endYear: end.year,
        endDay: end.dayOfYear,
        endAbs,
        durationDays: days,
        isPeakSeason: isPeakTourismSeason(time.season),
        priceMultiplier: mult,
        ticketCostMinor: ticket,
        lodgingCostMinor: lodgingCost,
        totalCostMinor: total,
        energyReward,
        lodgingType,
        lodgingPropertySource,
        lodgingPropertyId,
        lodgingOwnerCharacterId: lodgingOwnerId,
        paidOut: true, // đã thanh toán/chi trả upfront
        rewardApplied: false,
      });

      return {
        ok: true,
        trip: tripDto(row),
        totalCost: money(total),
        message: `Bạn đã bắt đầu nghỉ dưỡng ${days} ngày tại ${province.name}. Trong thời gian này sẽ tạm khóa đi làm và chợ đen.`,
      };
    });
  }
}

export const travelService = new TravelService();
