-- 0087_family_children_pregnancy_adoption_custody.sql
-- Gia đình & Con cái: nhân vật phụ thuộc, thai kỳ, nhận con nuôi, nuôi dưỡng, quyền nuôi/cấp dưỡng.
-- Idempotent, forward-only.

BEGIN;

-- 1) Characters: cho phép phụ thuộc (không gắn user đăng nhập) + thuộc tính con cái/nuôi dưỡng/custody
ALTER TABLE characters
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS is_dependent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_1_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_2_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wellbeing integer,
  ADD COLUMN IF NOT EXISTS care_tier text,
  ADD COLUMN IF NOT EXISTS is_adopted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS custodial_parent_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_support_payer_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS child_support_percent integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS child_support_started_game_year integer,
  ADD COLUMN IF NOT EXISTS child_support_started_game_day integer,
  ADD COLUMN IF NOT EXISTS child_support_last_period_key text,
  ADD COLUMN IF NOT EXISTS care_debt_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_care_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_care_game_abs bigint,
  ADD COLUMN IF NOT EXISTS last_birth_game_year integer,
  ADD COLUMN IF NOT EXISTS last_birth_game_day integer,
  ADD COLUMN IF NOT EXISTS dependent_status text NOT NULL DEFAULT 'none';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_wellbeing_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_wellbeing_check CHECK (wellbeing IS NULL OR (wellbeing >= 0 AND wellbeing <= 100));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_care_tier_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_care_tier_check CHECK (care_tier IS NULL OR care_tier IN ('economy','standard','premium'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_child_support_percent_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_child_support_percent_check CHECK (child_support_percent >= 0 AND child_support_percent <= 100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_dependent_status_check') THEN
    ALTER TABLE characters ADD CONSTRAINT characters_dependent_status_check CHECK (dependent_status IN ('none','infant','child','adult','lost_custody'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS characters_is_dependent_idx ON characters (is_dependent);
CREATE INDEX IF NOT EXISTS characters_parent_1_idx ON characters (parent_1_id);
CREATE INDEX IF NOT EXISTS characters_parent_2_idx ON characters (parent_2_id);
CREATE INDEX IF NOT EXISTS characters_custodial_parent_idx ON characters (custodial_parent_id);

-- 2) Thai kỳ (10 tháng game = 300 ngày game)
CREATE TABLE IF NOT EXISTS pregnancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pregnant_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  other_parent_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  proposer_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  partner_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','miscarried','cancelled')),
  start_game_year integer NOT NULL,
  start_game_day integer NOT NULL,
  due_game_year integer NOT NULL,
  due_game_day integer NOT NULL,
  health_warning_days integer NOT NULL DEFAULT 0,
  child_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  miscarriage_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT pregnancies_parents_distinct CHECK (pregnant_character_id <> other_parent_character_id)
);

CREATE INDEX IF NOT EXISTS pregnancies_pregnant_idx ON pregnancies (pregnant_character_id, status);
CREATE INDEX IF NOT EXISTS pregnancies_other_parent_idx ON pregnancies (other_parent_character_id, status);
CREATE INDEX IF NOT EXISTS pregnancies_status_due_idx ON pregnancies (status, due_game_year, due_game_day);

-- 3) Đề xuất sinh con (đồng thuận 2 bên, tương tự marriage proposal)
CREATE TABLE IF NOT EXISTS birth_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  partner_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT birth_proposals_not_self CHECK (proposer_character_id <> partner_character_id)
);

CREATE INDEX IF NOT EXISTS birth_proposals_partner_idx ON birth_proposals (partner_character_id, status);
CREATE INDEX IF NOT EXISTS birth_proposals_proposer_idx ON birth_proposals (proposer_character_id, status);

-- 4) Đơn nhận con nuôi (trẻ NPC hệ thống cung cấp, xét duyệt 30 ngày game)
CREATE TABLE IF NOT EXISTS adoption_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  spouse_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  child_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_spouse_approval','pending_review','completed','cancelled','rejected')),
  applied_game_year integer NOT NULL,
  applied_game_day integer NOT NULL,
  review_complete_game_year integer NOT NULL,
  review_complete_game_day integer NOT NULL,
  spouse_approved boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS adoption_applications_applicant_idx ON adoption_applications (applicant_character_id, status);
CREATE INDEX IF NOT EXISTS adoption_applications_spouse_idx ON adoption_applications (spouse_character_id, status);
CREATE INDEX IF NOT EXISTS adoption_applications_child_idx ON adoption_applications (child_character_id, status);
CREATE INDEX IF NOT EXISTS adoption_applications_review_idx ON adoption_applications (status, review_complete_game_year, review_complete_game_day);

-- 5) Ly hôn: thỏa thuận/phán quyết quyền nuôi con (nếu bảng tồn tại)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'divorce_proposals'
  ) THEN
    ALTER TABLE divorce_proposals
      ADD COLUMN IF NOT EXISTS custody_terms jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- 6) Theo dõi thu nhập tháng (phục vụ trích cấp dưỡng 20% thu nhập/tháng)
CREATE TABLE IF NOT EXISTS character_monthly_income (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  income_minor bigint NOT NULL DEFAULT 0,
  support_deducted_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, period_key)
);

INSERT INTO schema_migrations (filename) VALUES ('0087_family_children_pregnancy_adoption_custody.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
