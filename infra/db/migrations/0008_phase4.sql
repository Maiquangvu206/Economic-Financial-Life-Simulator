-- Phase 4: Pháp lý, xã hội, giáo dục
--
-- Bảng bổ sung:
-- - marriage_contracts: hợp đồng hôn nhân / prenup
-- - evidences: bằng chứng cho tòa án
-- - tuition_payments: học phí đã đóng
-- - skill_progress: tiến độ kỹ năng
-- - business_licenses: giấy phép kinh doanh (có thể bị hủy)
-- Seed: trường đại học VN (phục vụ Education module).

BEGIN;

CREATE TABLE IF NOT EXISTS marriage_contracts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id     uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  spouse_id        uuid NOT NULL REFERENCES characters (id) ON DELETE SET NULL,
  prenup_enabled   boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'divorced', 'widowed')),
  married_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marriage_contracts_character_idx
  ON marriage_contracts (character_id, status);
CREATE INDEX IF NOT EXISTS marriage_contracts_spouse_idx
  ON marriage_contracts (spouse_id, status);

CREATE TABLE IF NOT EXISTS evidences (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id        uuid NOT NULL REFERENCES court_cases (id) ON DELETE CASCADE,
  submitted_by   uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  strength       integer NOT NULL CHECK (strength BETWEEN 0 AND 100),
  description    text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidences_case_idx ON evidences (case_id);

CREATE TABLE IF NOT EXISTS tuition_payments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES universities (id) ON DELETE CASCADE,
  degree_id     uuid REFERENCES degrees (id) ON DELETE SET NULL,
  amount_minor  bigint NOT NULL CHECK (amount_minor >= 0),
  paid_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tuition_payments_character_idx
  ON tuition_payments (character_id, paid_at DESC);

CREATE TABLE IF NOT EXISTS skill_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  skill        text NOT NULL,
  progress     integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, skill)
);

CREATE TABLE IF NOT EXISTS business_licenses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  license_type text NOT NULL,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'suspended', 'revoked')),
  issued_at    timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);

CREATE INDEX IF NOT EXISTS business_licenses_company_idx
  ON business_licenses (company_id, status);

-- Seed: 6 trường đại học VN (tuition in VNĐ minor units).
INSERT INTO universities (id, name, degree_code, field, tuition_minor, duration_months, stat_bonus)
VALUES
  (gen_random_uuid(), 'Đại học Bách Khoa Hà Nội', 'BK_HUST', 'technology_ai', 500000000, 48, '{"intelligence": 15}'::jsonb),
  (gen_random_uuid(), 'Đại học Kinh tế Quốc dân', 'NEU', 'finance_banking', 400000000, 48, '{"finance": 15}'::jsonb),
  (gen_random_uuid(), 'Đại học Ngoại thương', 'FTU', 'finance_banking', 450000000, 48, '{"business": 15}'::jsonb),
  (gen_random_uuid(), 'Đại học Luật Hà Nội', 'HLU', 'education', 350000000, 48, '{"law": 20}'::jsonb),
  (gen_random_uuid(), 'Đại học Y Dược TP.HCM', 'UMP', 'healthcare_pharma', 600000000, 60, '{"health": 15}'::jsonb),
  (gen_random_uuid(), 'Đại học Nông Lâm TP.HCM', 'NLU', 'agritech', 300000000, 48, '{"agriculture": 15}'::jsonb)
ON CONFLICT (degree_code) DO NOTHING;

COMMIT;
