BEGIN;

ALTER TABLE characters
  DROP COLUMN IF EXISTS stamina_month_days_count,
  DROP COLUMN IF EXISTS stamina_month_fully_active,
  DROP COLUMN IF EXISTS stamina_month_key;

COMMIT;
