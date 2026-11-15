-- 0033: Phúc lợi (welfare/holiday benefits) do admin cấu hình, nhận thưởng server-side
BEGIN;

CREATE TABLE IF NOT EXISTS welfare_benefits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  sender text NOT NULL DEFAULT 'Hệ thống',
  bonus_minor bigint NOT NULL DEFAULT 0 CHECK (bonus_minor >= 0),
  month int CHECK (month IS NULL OR (month >= 1 AND month <= 12)),
  day int CHECK (day IS NULL OR (day >= 1 AND day <= 31)),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welfare_benefits_code_unique UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS welfare_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benefit_id uuid NOT NULL REFERENCES welfare_benefits (id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  period_year int NOT NULL,
  amount_minor bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT welfare_claims_unique UNIQUE (benefit_id, character_id, period_year)
);

CREATE INDEX IF NOT EXISTS welfare_benefits_active_idx ON welfare_benefits (is_active, month, day);
CREATE INDEX IF NOT EXISTS welfare_claims_character_idx ON welfare_claims (character_id, claimed_at DESC);

-- Seed mặc định theo các dịp lễ phổ biến (có thể chỉnh trong admin)
INSERT INTO welfare_benefits (code, name, description, sender, bonus_minor, month, day, is_active)
VALUES
  ('tet_duong', 'Tết Dương Lịch', 'Thưởng phúc lợi dịp Tết Dương Lịch.', 'Bộ Lao động & Quỹ Phúc lợi Công dân', 1000000, 1, 1, true),
  ('tet_nguyen_dan', 'Tết Nguyên Đán', 'Lì xì/phúc lợi dịp Tết Nguyên Đán.', 'Ủy ban Nhân dân Thành phố & Hiệp hội Doanh nghiệp', 2000000, 2, 10, true),
  ('hung_kings', 'Giỗ Tổ Hùng Vương', 'Thưởng phúc lợi dịp Giỗ Tổ Hùng Vương.', 'Bộ Lao động & Quỹ Phúc lợi Công dân', 1000000, 4, 18, true),
  ('le_30_4', '30/4 - 1/5', 'Thưởng phúc lợi dịp 30/4 - 1/5.', 'Bộ Lao động & Quỹ Phúc lợi Công dân', 1000000, 4, 30, true),
  ('quoc_khanh', 'Quốc khánh 2/9', 'Thưởng phúc lợi dịp Quốc khánh 2/9.', 'Bộ Lao động & Quỹ Phúc lợi Công dân', 1000000, 9, 2, true)
ON CONFLICT (code) DO NOTHING;

COMMIT;
