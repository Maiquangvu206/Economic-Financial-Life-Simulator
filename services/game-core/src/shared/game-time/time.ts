import { deriveCanonicalGameTime, GAME_DAYS_PER_YEAR, normalizeSeasonRanges, DEFAULT_SEASON_RANGES, type CanonicalGameTime } from '@efls/domain';
import type { Db } from '../db/tx.js';

export interface GameStateTimeRow {
  current_day: number;
  current_year: number;
  season: string;
  macro: any;
  updated_at: Date | string | null;
}

export interface GameTimeSnapshot {
  year: number;
  month: number;
  day: number;
  dayOfYear: number;
  hour: number;
  minute: number;
  minuteOfDay: number;
  season: string;
  period: string;
  absDay: number;
}

export async function getGameStateRow(db: Db): Promise<GameStateTimeRow> {
  const r = await db.query<any>(`SELECT current_day, current_year, season, macro, updated_at FROM game_state WHERE id = 1`);
  const row = r.rows[0];
  if (!row) throw new Error('game_state missing');
  return {
    current_day: Number(row.current_day ?? 0),
    current_year: Number(row.current_year ?? 2000),
    season: String(row.season ?? 'spring'),
    macro: row.macro && typeof row.macro === 'object' ? row.macro : {},
    updated_at: row.updated_at ?? null,
  };
}

export function toGameTimeSnapshot(gs: GameStateTimeRow, now: Date = new Date()): GameTimeSnapshot {
  const seasonRanges = normalizeSeasonRanges(gs.macro?.seasonRanges) ?? DEFAULT_SEASON_RANGES;
  const t = deriveCanonicalGameTime({
    dayOfYear: gs.current_day,
    year: gs.current_year,
    tickUpdatedAt: gs.updated_at,
    now,
    seasonRanges,
  });
  const normalizedDay = ((Math.floor(gs.current_day) % GAME_DAYS_PER_YEAR) + GAME_DAYS_PER_YEAR) % GAME_DAYS_PER_YEAR;
  const absDay = Math.floor(gs.current_year) * GAME_DAYS_PER_YEAR + normalizedDay;
  return {
    year: t.year,
    month: t.month,
    day: t.day,
    dayOfYear: t.dayOfYear,
    hour: t.hour,
    minute: t.minute,
    minuteOfDay: t.hour * 60 + t.minute,
    season: t.season,
    period: t.period,
    absDay,
  };
}

export async function getCurrentGameTime(db: Db, now: Date = new Date()): Promise<GameTimeSnapshot> {
  const gs = await getGameStateRow(db);
  return toGameTimeSnapshot(gs, now);
}

export function gameTimeDto(t: GameTimeSnapshot) {
  return {
    year: t.year,
    month: t.month,
    day: t.day,
    dayOfYear: t.dayOfYear,
    hour: t.hour,
    minute: t.minute,
    season: t.season,
    period: t.period,
  };
}
