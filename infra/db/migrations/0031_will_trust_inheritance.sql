-- 0031: Di chúc, thụ hưởng & quỹ tín thác theo CCCD (Pha 3 nền tảng)
BEGIN;

-- Danh sách thụ hưởng di chúc theo CCCD (tổng tỷ lệ <= 100%, kiểm tra nghiệp vụ)
CREATE TABLE IF NOT EXISTS will_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  will_id uuid NOT NULL REFERENCES wills (id) ON DELETE CASCADE,
  beneficiary_cccd char(12) NOT NULL,
  beneficiary_character_id uuid REFERENCES characters (id) ON DELETE SET NULL,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  relationship text NOT NULL DEFAULT 'Người thụ hưởng',
  note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT will_beneficiaries_unique UNIQUE (will_id, beneficiary_cccd)
);
CREATE INDEX IF NOT EXISTS will_beneficiaries_will_idx ON will_beneficiaries (will_id);
CREATE INDEX IF NOT EXISTS will_beneficiaries_cccd_idx ON will_beneficiaries (beneficiary_cccd);

-- Backfill từ will_heirs hiện có (nếu có) sang will_beneficiaries
INSERT INTO will_beneficiaries (will_id, beneficiary_cccd, beneficiary_character_id, share_pct, relationship, note)
SELECT wh.will_id, c.cccd, wh.heir_character_id, wh.share_pct, wh.relationship, wh.note
FROM will_heirs wh
JOIN characters c ON c.id = wh.heir_character_id
ON CONFLICT (will_id, beneficiary_cccd) DO NOTHING;

-- Quỹ tín thác: tách biệt khỏi di sản, nhiều người thụ hưởng theo tỷ lệ
CREATE TABLE IF NOT EXISTS trust_fund_beneficiaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_fund_id uuid NOT NULL REFERENCES trust_funds (id) ON DELETE CASCADE,
  beneficiary_cccd char(12) NOT NULL,
  beneficiary_character_id uuid REFERENCES characters (id) ON DELETE SET NULL,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trust_fund_beneficiaries_unique UNIQUE (trust_fund_id, beneficiary_cccd)
);
CREATE INDEX IF NOT EXISTS trust_fund_beneficiaries_fund_idx ON trust_fund_beneficiaries (trust_fund_id);

-- Backfill beneficiary hiện có của trust_funds (nếu có)
INSERT INTO trust_fund_beneficiaries (trust_fund_id, beneficiary_cccd, beneficiary_character_id, share_pct)
SELECT tf.id, c.cccd, tf.beneficiary_id, 100.00
FROM trust_funds tf
JOIN characters c ON c.id = tf.beneficiary_id
WHERE tf.beneficiary_id IS NOT NULL
ON CONFLICT (trust_fund_id, beneficiary_cccd) DO NOTHING;

-- Trạng thái xử lý di sản/kế thừa để idempotent
CREATE TABLE IF NOT EXISTS inheritance_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deceased_character_id uuid NOT NULL,
  deceased_cccd char(12) NOT NULL,
  successor_character_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  estate_cash_minor bigint NOT NULL DEFAULT 0,
  inherited_cash_minor bigint NOT NULL DEFAULT 0,
  unclaimed_cash_minor bigint NOT NULL DEFAULT 0,
  tax_minor bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inheritance_settlements_deceased_idx ON inheritance_settlements (deceased_character_id);
CREATE INDEX IF NOT EXISTS inheritance_settlements_status_idx ON inheritance_settlements (status);

COMMIT;
