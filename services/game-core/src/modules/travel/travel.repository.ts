import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface TravelTripRow {
  id: string;
  character_id: string;
  province_code: string;
  province_name: string | null;
  trip_kind: string;
  status: string;
  start_game_year: number;
  start_game_day: number;
  start_abs_day: number;
  end_game_year: number;
  end_game_day: number;
  end_abs_day: number;
  duration_days: number;
  is_peak_season: boolean;
  price_multiplier: string | number;
  ticket_cost_minor: string | number;
  lodging_cost_minor: string | number;
  total_cost_minor: string | number;
  energy_reward: number;
  lodging_type: string;
  lodging_property_source: string | null;
  lodging_property_id: string | null;
  lodging_owner_character_id: string | null;
  paid_out: boolean;
  reward_applied: boolean;
  created_at: Date;
  completed_at: Date | null;
}

export interface PlayerLodgingRow {
  property_id: string;
  source: 'province_land';
  province_code: string;
  name: string;
  owner_character_id: string;
  owner_name: string | null;
  monthly_rent_minor: string | number;
  rent_deposit_minor: string | number;
  property_type: string;
}

export class TravelRepository {
  constructor(public readonly db: Db = pool) {}

  async getActiveTrip(characterId: string, db: Db = this.db): Promise<TravelTripRow | null> {
    const r = await db.query<TravelTripRow>(
      `SELECT * FROM travel_trips WHERE character_id = $1 AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
      [characterId],
    ).catch(() => ({ rows: [] as TravelTripRow[] }));
    return r.rows[0] ?? null;
  }

  async listHistory(characterId: string, limit = 10, db: Db = this.db): Promise<TravelTripRow[]> {
    const r = await db.query<TravelTripRow>(
      `SELECT * FROM travel_trips WHERE character_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [characterId, limit],
    ).catch(() => ({ rows: [] as TravelTripRow[] }));
    return r.rows;
  }

  async listProvinces(db: Db = this.db): Promise<Array<{ code: string; name: string; region: string; is_city: boolean }>> {
    const r = await db.query<{ code: string; name: string; region: string; is_city: boolean }>(
      `SELECT code, name, region, is_city FROM provinces ORDER BY is_city DESC, name ASC`,
    ).catch(() => ({ rows: [] as any[] }));
    return r.rows;
  }

  async getProvince(code: string, db: Db = this.db): Promise<{ code: string; name: string; region: string; is_city: boolean } | null> {
    const r = await db.query<{ code: string; name: string; region: string; is_city: boolean }>(
      `SELECT code, name, region, is_city FROM provinces WHERE code = $1`,
      [code],
    ).catch(() => ({ rows: [] as any[] }));
    return r.rows[0] ?? null;
  }

  async listPlayerLodgingOptions(provinceCode: string, db: Db = this.db): Promise<PlayerLodgingRow[]> {
    const r = await db.query<PlayerLodgingRow>(
      `SELECT pl.id AS property_id,
              'province_land'::text AS source,
              pl.province_code,
              COALESCE(pl.construction_label, pl.property_type, 'BĐS') || ' - ' || pl.node_name AS name,
              pl.owner_character_id,
              ch.full_name AS owner_name,
              COALESCE(pl.monthly_rent_minor, 0)::text AS monthly_rent_minor,
              COALESCE(pl.rent_deposit_minor, 0)::text AS rent_deposit_minor,
              pl.property_type
       FROM province_land_properties pl
       LEFT JOIN characters ch ON ch.id = pl.owner_character_id
       WHERE pl.province_code = $1
         AND pl.status = 'owned'
         AND COALESCE(pl.rent_listing_active, false) = true
         AND pl.owner_character_id IS NOT NULL
         AND pl.merged_into_property_id IS NULL
       ORDER BY COALESCE(pl.monthly_rent_minor,0) ASC, pl.updated_at DESC NULLS LAST, pl.id ASC
       LIMIT 50`,
      [provinceCode],
    ).catch(() => ({ rows: [] as PlayerLodgingRow[] }));
    return r.rows;
  }

  async insertTrip(db: Db, input: {
    characterId: string; provinceCode: string; provinceName: string | null; tripKind: 'short'|'retreat'; status: 'active'|'completed';
    startYear: number; startDay: number; startAbs: number; endYear: number; endDay: number; endAbs: number; durationDays: number;
    isPeakSeason: boolean; priceMultiplier: number; ticketCostMinor: number; lodgingCostMinor: number; totalCostMinor: number;
    energyReward: number; lodgingType: 'npc_hotel'|'player_property'|'none'; lodgingPropertySource?: string | null; lodgingPropertyId?: string | null;
    lodgingOwnerCharacterId?: string | null; paidOut: boolean; rewardApplied: boolean; completedAt?: Date | null;
  }): Promise<TravelTripRow> {
    const r = await db.query<TravelTripRow>(
      `INSERT INTO travel_trips
        (id, character_id, province_code, province_name, trip_kind, status,
         start_game_year, start_game_day, start_abs_day, end_game_year, end_game_day, end_abs_day, duration_days,
         is_peak_season, price_multiplier, ticket_cost_minor, lodging_cost_minor, total_cost_minor, energy_reward,
         lodging_type, lodging_property_source, lodging_property_id, lodging_owner_character_id, paid_out, reward_applied, created_at, completed_at)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24, now(), $25)
       RETURNING *`,
      [
        input.characterId, input.provinceCode, input.provinceName, input.tripKind, input.status,
        input.startYear, input.startDay, input.startAbs, input.endYear, input.endDay, input.endAbs, input.durationDays,
        input.isPeakSeason, input.priceMultiplier, Math.round(input.ticketCostMinor), Math.round(input.lodgingCostMinor), Math.round(input.totalCostMinor),
        Math.round(input.energyReward), input.lodgingType, input.lodgingPropertySource ?? null, input.lodgingPropertyId ?? null, input.lodgingOwnerCharacterId ?? null,
        input.paidOut, input.rewardApplied, input.completedAt ?? null,
      ],
    );
    return r.rows[0]!;
  }
}

export const travelRepository = new TravelRepository();
