BEGIN;
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_cccd_key;
CREATE UNIQUE INDEX IF NOT EXISTS characters_cccd_uidx ON characters (cccd) WHERE cccd IS NOT NULL;
ALTER TABLE characters ALTER COLUMN cccd DROP NOT NULL;
ALTER TABLE characters DROP COLUMN IF EXISTS is_alive;
DROP INDEX IF EXISTS characters_alive_idx;
COMMIT;
