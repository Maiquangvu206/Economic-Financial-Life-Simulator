-- 0091: Track per-character monthly activity for monthly stamina/health drain
-- Deduct stamina only when a character is active for the full in-game month (settled at month end).

BEGIN;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS stamina_month_key text,
  ADD COLUMN IF NOT EXISTS stamina_month_fully_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stamina_month_days_count integer NOT NULL DEFAULT 0;

COMMIT;
