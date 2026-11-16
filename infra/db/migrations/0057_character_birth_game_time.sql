-- 0057: Anchor character age to game time (birth in game year/day) so age updates correctly with system time.
-- Idempotent, forward-only. Does not reset game_state.
BEGIN;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS birth_game_year integer;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS birth_game_day integer;

-- Backfill existing rows: preserve current age relative to current game state.
UPDATE characters c
SET
  birth_game_year = COALESCE(c.birth_game_year, (gs.current_year::int - COALESCE(c.age, 0))),
  birth_game_day  = COALESCE(c.birth_game_day,  ((gs.current_day::int % 360) + 360) % 360)
FROM game_state gs
WHERE gs.id = 1;

-- Sanity clamps (defensive)
UPDATE characters
SET birth_game_day = ((birth_game_day % 360) + 360) % 360
WHERE birth_game_day IS NOT NULL;

INSERT INTO schema_migrations (filename) VALUES ('0057_character_birth_game_time.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
