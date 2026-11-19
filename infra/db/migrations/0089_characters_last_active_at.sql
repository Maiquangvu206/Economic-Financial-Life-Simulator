-- 0089: Track player character activity to avoid offline health decay
-- Idempotent / forward-only.

BEGIN;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

CREATE INDEX IF NOT EXISTS characters_last_active_at_idx
  ON characters (last_active_at)
  WHERE last_active_at IS NOT NULL;

COMMIT;
