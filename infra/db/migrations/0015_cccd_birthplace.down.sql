-- Down: revert CCCD + nơi sinh (0015_cccd_birthplace.sql)
BEGIN;

DROP INDEX IF EXISTS characters_cccd_uidx;
ALTER TABLE characters DROP COLUMN IF EXISTS birthplace;
ALTER TABLE characters DROP COLUMN IF EXISTS cccd;
DROP TABLE IF EXISTS provinces;

COMMIT;
