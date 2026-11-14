BEGIN;
DROP TABLE IF EXISTS bank_transfers;
DROP INDEX IF EXISTS characters_account_number_idx;
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_account_number_key;
ALTER TABLE characters DROP COLUMN IF EXISTS account_number;
COMMIT;
