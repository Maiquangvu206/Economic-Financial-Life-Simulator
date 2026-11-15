-- Offline: cấu hình người chơi, chính sách admin, bản ghi recap (idempotent-ish)

CREATE TABLE IF NOT EXISTS offline_policies (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  max_offline_minutes integer NOT NULL DEFAULT 1440, -- tối đa thời gian bù (phút thực)
  allow_auto_claim_welfare boolean NOT NULL DEFAULT true,
  allow_auto_pay boolean NOT NULL DEFAULT true,
  allow_catchup boolean NOT NULL DEFAULT true,
  default_auto_claim_welfare boolean NOT NULL DEFAULT true,
  default_auto_pay boolean NOT NULL DEFAULT true,
  default_catchup boolean NOT NULL DEFAULT true,
  default_show_recap boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO offline_policies (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS character_offline_settings (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  offline_processing_enabled boolean NOT NULL DEFAULT true,
  auto_claim_welfare boolean NOT NULL DEFAULT true,
  auto_pay boolean NOT NULL DEFAULT true,
  catchup_enabled boolean NOT NULL DEFAULT true,
  show_recap_on_login boolean NOT NULL DEFAULT true,
  last_offline_processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS offline_recaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  from_at timestamptz NOT NULL,
  to_at timestamptz NOT NULL,
  processed_minutes integer NOT NULL DEFAULT 0,
  income_minor bigint NOT NULL DEFAULT 0,
  expenses_minor bigint NOT NULL DEFAULT 0,
  net_cash_flow_minor bigint NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offline_recaps_character_created ON offline_recaps(character_id, created_at DESC);