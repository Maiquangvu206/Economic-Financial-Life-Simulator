import type { Db } from '../db/tx.js';
import { AppError } from '../http/errors.js';

export interface ActiveTripRow {
  id: string;
  character_id: string;
  province_code: string;
  province_name: string | null;
  trip_kind: string;
  status: string;
  end_abs_day: number;
  end_game_year: number;
  end_game_day: number;
}

export async function getActiveTrip(db: Db, characterId: string): Promise<ActiveTripRow | null> {
  const r = await db.query<ActiveTripRow>(
    `SELECT id, character_id, province_code, province_name, trip_kind, status, end_abs_day, end_game_year, end_game_day
     FROM travel_trips
     WHERE character_id = $1 AND status = 'active'
     ORDER BY created_at DESC
     LIMIT 1`,
    [characterId],
  ).catch(() => ({ rows: [] as ActiveTripRow[] }));
  return r.rows[0] ?? null;
}

export async function assertNotOnActiveTrip(db: Db, characterId: string, actionLabel = 'thực hiện thao tác này'): Promise<void> {
  const trip = await getActiveTrip(db, characterId);
  if (!trip) return;
  throw AppError.conflict('active_trip', `Bạn đang trong chuyến đi/du lịch và không thể ${actionLabel} lúc này.`);
}
