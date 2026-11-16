import type { Db } from '../db/tx.js';
import {
  DEFAULT_SEASON_RANGES,
  deriveCanonicalGameTime,
  GAME_START_YEAR,
  normalizeSeasonRanges,
  resolveSeasonEffects,
  type Season,
  type SeasonEffectConfig,
} from '@efls/domain';

export interface CurrentSeasonEffects {
  season: Season;
  month: number;
  config: SeasonEffectConfig;
  multipliers: { productivity: number; energy: number; tax: number; revenue: number };
}

/**
 * Đọc mùa hiện tại + hiệu ứng mùa đã cấu hình (macro.seasonEffects) từ game_state.
 * Dùng chung cho thuế, doanh thu công ty và các luồng kinh tế khác.
 */
export async function loadCurrentSeasonEffects(db: Db): Promise<CurrentSeasonEffects> {
  const r = await (db as any).query(`SELECT current_day, current_year, macro FROM game_state WHERE id = 1`);
  const row = r.rows?.[0] ?? { current_day: 0, current_year: GAME_START_YEAR, macro: {} };
  const macro = row.macro && typeof row.macro === 'object' ? row.macro : {};
  const ranges = normalizeSeasonRanges(macro.seasonRanges) ?? DEFAULT_SEASON_RANGES;
  const t = deriveCanonicalGameTime({
    dayOfYear: Number(row.current_day ?? 0),
    year: Number(row.current_year ?? GAME_START_YEAR),
    seasonRanges: ranges,
  });
  const effects = resolveSeasonEffects(t.season, macro.seasonEffects);
  return {
    season: t.season,
    month: t.month,
    config: effects.config,
    multipliers: {
      productivity: effects.productivity,
      energy: effects.energy,
      tax: effects.tax,
      revenue: effects.revenue,
    },
  };
}
