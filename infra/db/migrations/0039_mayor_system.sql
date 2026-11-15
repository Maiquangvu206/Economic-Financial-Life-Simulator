-- 0039_mayor_system.sql
-- Hệ thống Thị trưởng: nhiệm kỳ, quyền lợi (phụ cấp), chính sách/quỹ (whitelist), trách nhiệm & thu hồi tư cách (admin revoke).
-- Forward-only, idempotent.

BEGIN;

-- 1) Mở rộng elections để lưu nhiệm kỳ và trạng thái thị trưởng
ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS winner_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS term_days integer,
  ADD COLUMN IF NOT EXISTS term_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS term_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS term_status text NOT NULL DEFAULT 'none', -- none|active|expired|revoked
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revoked_reason text,
  ADD COLUMN IF NOT EXISTS salary_last_game_day integer,
  ADD COLUMN IF NOT EXISTS salary_last_game_year integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'elections_term_status_chk') THEN
    ALTER TABLE elections
      ADD CONSTRAINT elections_term_status_chk
      CHECK (term_status IN ('none','active','expired','revoked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS elections_term_status_idx ON elections (term_status, term_ends_at DESC);
CREATE INDEX IF NOT EXISTS elections_winner_character_idx ON elections (winner_character_id);

-- 2) Lịch sử hành động/chính sách của Thị trưởng (Pha B/C) và thu hồi
CREATE TABLE IF NOT EXISTS mayor_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid REFERENCES elections(id) ON DELETE SET NULL,
  actor_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL, -- salary_claim|policy_*|revoke|expire|appoint etc
  status text NOT NULL DEFAULT 'applied', -- applied|failed|reverted
  amount_minor bigint,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mayor_actions_election_idx ON mayor_actions (election_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mayor_actions_type_idx ON mayor_actions (action_type, created_at DESC);

-- 3) Cấu hình mặc định mayor trong game_state.macro (không ghi đè nếu đã có)
INSERT INTO game_state (id, current_day, current_year, season, macro)
VALUES (1, 0, 1, 'spring', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE game_state
SET macro = jsonb_set(
  COALESCE(macro, '{}'::jsonb),
  '{mayor}',
  jsonb_build_object(
    'enabled', true,
    'termDays', 7,
    'salaryMinor', 2000000,
    'salaryIntervalGameDays', 1,
    'perkTaxDiscountPct', 5,
    'policyCooldownMinutes', 30,
    'policyCostMinor', 1000000,
    'treasurySpendLimitMinor', 50000000,
    'otRateAdjustMinPct', 100,
    'otRateAdjustMaxPct', 500,
    'otRateAdjustStepPct', 10,
    'welfareBonusPerCitizenMinor', 50000,
    'welfareBonusMaxCitizens', 200
  ),
  true
)
WHERE (macro->'mayor') IS NULL;

COMMIT;
