BEGIN;

DROP INDEX IF EXISTS characters_last_active_at_idx;
ALTER TABLE characters DROP COLUMN IF EXISTS last_active_at;

COMMIT;
