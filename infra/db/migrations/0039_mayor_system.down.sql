-- Down migration for 0039_mayor_system (best-effort). Forward-only environment: use with caution.
BEGIN;
DROP TABLE IF EXISTS mayor_actions;
ALTER TABLE elections
  DROP COLUMN IF EXISTS winner_character_id,
  DROP COLUMN IF EXISTS term_days,
  DROP COLUMN IF EXISTS term_started_at,
  DROP COLUMN IF EXISTS term_ends_at,
  DROP COLUMN IF EXISTS term_status,
  DROP COLUMN IF EXISTS revoked_at,
  DROP COLUMN IF EXISTS revoked_by,
  DROP COLUMN IF EXISTS revoked_reason,
  DROP COLUMN IF EXISTS salary_last_game_day,
  DROP COLUMN IF EXISTS salary_last_game_year;
-- giữ macro.mayor trong game_state (không phá cấu hình hiện có)
COMMIT;
