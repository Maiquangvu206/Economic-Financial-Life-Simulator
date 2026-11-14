-- 0019: Sổ tiết kiệm nhiều kỳ hạn + cấu hình lãi suất theo kỳ hạn.

BEGIN;

-- Cấu hình lãi suất theo kỳ hạn (tháng). term_months = 0 nghĩa là không kỳ hạn (linh hoạt).
CREATE TABLE IF NOT EXISTS savings_rate_config (
  term_months      integer PRIMARY KEY CHECK (term_months >= 0),
  annual_rate_pct  numeric(6, 3) NOT NULL CHECK (annual_rate_pct >= 0),
  early_withdraw_penalty_pct numeric(6, 3) NOT NULL DEFAULT 0 CHECK (early_withdraw_penalty_pct >= 0),
  label            text NOT NULL
);

INSERT INTO savings_rate_config (term_months, annual_rate_pct, early_withdraw_penalty_pct, label) VALUES
  (0, 0.500, 0.000, 'Không kỳ hạn'),
  (1, 3.000, 0.500, '1 tháng'),
  (3, 3.500, 0.500, '3 tháng'),
  (6, 4.500, 1.000, '6 tháng'),
  (12, 5.500, 1.500, '12 tháng'),
  (24, 6.000, 2.000, '24 tháng')
ON CONFLICT (term_months) DO UPDATE
SET annual_rate_pct = EXCLUDED.annual_rate_pct,
    early_withdraw_penalty_pct = EXCLUDED.early_withdraw_penalty_pct,
    label = EXCLUDED.label;

-- Mỗi sổ tiết kiệm là một khoản gửi (có thể nhiều sổ/nhân vật).
CREATE TABLE IF NOT EXISTS savings_deposits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id        uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  principal_minor     bigint NOT NULL CHECK (principal_minor >= 0),
  balance_minor       bigint NOT NULL CHECK (balance_minor >= 0),
  term_months         integer NOT NULL DEFAULT 0 CHECK (term_months >= 0),
  annual_rate_pct     numeric(6, 3) NOT NULL CHECK (annual_rate_pct >= 0),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  matures_at          timestamptz,
  closed_at           timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS savings_deposits_character_idx ON savings_deposits (character_id, status);

-- Chuyển số dư tiết kiệm cũ (1 tài khoản/nhân vật) sang sổ không kỳ hạn.
INSERT INTO savings_deposits (id, character_id, principal_minor, balance_minor, term_months, annual_rate_pct, status, opened_at, matures_at)
SELECT
  gen_random_uuid(),
  sa.character_id,
  sa.balance_minor,
  sa.balance_minor,
  0,
  COALESCE((SELECT annual_rate_pct FROM savings_rate_config WHERE term_months = 0), sa.annual_rate_pct, 0.5),
  'active',
  sa.opened_at,
  NULL
FROM savings_accounts sa
WHERE sa.balance_minor > 0
  AND NOT EXISTS (
    SELECT 1 FROM savings_deposits sd WHERE sd.character_id = sa.character_id AND sd.status = 'active'
  );

-- Giữ savings_accounts.balance_minor làm tổng (tương thích) - sẽ được service đồng bộ.

COMMIT;
