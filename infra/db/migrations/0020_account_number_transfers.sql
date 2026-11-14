-- 0020: STK nhân vật, lịch sử chuyển khoản, hỗ trợ cấp bậc tài khoản.

BEGIN;

-- Số tài khoản (STK) duy nhất cho mỗi nhân vật.
ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS account_number varchar(12);

-- Backfill STK 10 chữ số cho nhân vật chưa có (đảm bảo duy nhất).
DO $$
DECLARE
  r RECORD;
  candidate text;
  ok boolean;
BEGIN
  FOR r IN SELECT id FROM characters WHERE account_number IS NULL LOOP
    ok := false;
    WHILE NOT ok LOOP
      candidate := lpad((floor(random() * 9000000000) + 1000000000)::bigint::text, 10, '0');
      BEGIN
        UPDATE characters SET account_number = candidate WHERE id = r.id AND account_number IS NULL;
        ok := true;
      EXCEPTION WHEN unique_violation THEN
        ok := false;
      END;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE characters
  ALTER COLUMN account_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'characters_account_number_key'
  ) THEN
    ALTER TABLE characters ADD CONSTRAINT characters_account_number_key UNIQUE (account_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS characters_account_number_idx ON characters (account_number);

-- Lịch sử chuyển khoản giữa người dùng (theo nhân vật/STK).
CREATE TABLE IF NOT EXISTS bank_transfers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_character_id     uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  to_character_id       uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  from_account_number   varchar(12) NOT NULL,
  to_account_number     varchar(12) NOT NULL,
  amount_minor          bigint NOT NULL CHECK (amount_minor > 0),
  message               text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  ledger_transaction_id uuid REFERENCES ledger_transactions (id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transfers_from_idx ON bank_transfers (from_character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bank_transfers_to_idx ON bank_transfers (to_character_id, created_at DESC);

COMMIT;
