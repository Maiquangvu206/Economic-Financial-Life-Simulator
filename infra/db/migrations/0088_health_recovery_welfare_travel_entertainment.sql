-- 0088: Thể lực & Hồi phục (nghỉ ngơi, an sinh mở rộng/y tế/bảo hiểm, du lịch, giải trí)
-- Idempotent / forward-only.

BEGIN;

-- Quỹ bảo hiểm đóng góp (tách khỏi quỹ đất nước, dùng kết hợp cho an sinh/y tế)
CREATE TABLE IF NOT EXISTS insurance_fund (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO insurance_fund (id, balance_minor) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS insurance_fund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_minor bigint NOT NULL, -- + inflow, - outflow
  reason_code text NOT NULL,
  description text,
  ref_type text,
  ref_id text,
  actor_type text NOT NULL DEFAULT 'system',
  actor_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insurance_fund_transactions_created_idx ON insurance_fund_transactions (created_at DESC);

-- Đăng ký bảo hiểm đóng góp (trích % lương)
CREATE TABLE IF NOT EXISTS health_insurance_enrollments (
  character_id uuid PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  contribution_rate_pct numeric(5,2) NOT NULL DEFAULT 5.00 CHECK (contribution_rate_pct >= 0 AND contribution_rate_pct <= 50),
  is_mandatory boolean NOT NULL DEFAULT false,
  enrolled_game_year int NOT NULL,
  enrolled_game_day int NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Theo dõi hành động hồi phục/ngày game (giới hạn & cooldown)
CREATE TABLE IF NOT EXISTS character_wellness_daily (
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  game_year int NOT NULL,
  game_day int NOT NULL,
  home_rest_count int NOT NULL DEFAULT 0,
  last_home_rest_minute int, -- 0..1439 trong ngày game
  medical_count int NOT NULL DEFAULT 0,
  last_medical_game_year int,
  last_medical_game_day int,
  last_medical_minute int,
  entertainment_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  unemployment_claimed boolean NOT NULL DEFAULT false,
  low_income_claimed boolean NOT NULL DEFAULT false,
  low_energy_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, game_year, game_day)
);
CREATE INDEX IF NOT EXISTS character_wellness_daily_lookup_idx ON character_wellness_daily (character_id, game_year, game_day);

-- Nhật ký khám chữa bệnh / hỗ trợ an sinh (phục vụ định kỳ & đối soát)
CREATE TABLE IF NOT EXISTS medical_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  game_year int NOT NULL,
  game_day int NOT NULL,
  minute_of_day int,
  base_cost_minor bigint NOT NULL DEFAULT 0,
  discount_minor bigint NOT NULL DEFAULT 0,
  paid_minor bigint NOT NULL DEFAULT 0,
  used_insurance boolean NOT NULL DEFAULT false,
  energy_gain int NOT NULL DEFAULT 25,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medical_visits_character_idx ON medical_visits (character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS welfare_support_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  support_type text NOT NULL CHECK (support_type IN ('unemployment','low_income','low_energy')),
  period_key text NOT NULL, -- e.g. YYYY-MM
  game_year int NOT NULL,
  game_day int NOT NULL,
  birth_province_code text,
  amount_minor bigint NOT NULL DEFAULT 0,
  insurance_bonus_applied boolean NOT NULL DEFAULT false,
  source_state_minor bigint NOT NULL DEFAULT 0,
  source_insurance_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, support_type, period_key)
);
CREATE INDEX IF NOT EXISTS welfare_support_claims_char_idx ON welfare_support_claims (character_id, created_at DESC);

-- Du lịch / nghỉ dưỡng
CREATE TABLE IF NOT EXISTS travel_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  province_code text NOT NULL,
  province_name text,
  trip_kind text NOT NULL CHECK (trip_kind IN ('short','retreat')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
  start_game_year int NOT NULL,
  start_game_day int NOT NULL,
  start_abs_day int NOT NULL,
  end_game_year int NOT NULL,
  end_game_day int NOT NULL,
  end_abs_day int NOT NULL,
  duration_days int NOT NULL DEFAULT 0,
  is_peak_season boolean NOT NULL DEFAULT false,
  price_multiplier numeric(6,3) NOT NULL DEFAULT 1.000,
  ticket_cost_minor bigint NOT NULL DEFAULT 0,
  lodging_cost_minor bigint NOT NULL DEFAULT 0,
  total_cost_minor bigint NOT NULL DEFAULT 0,
  energy_reward int NOT NULL DEFAULT 0,
  lodging_type text NOT NULL DEFAULT 'npc_hotel' CHECK (lodging_type IN ('npc_hotel','player_property','none')),
  lodging_property_source text, -- 'province_land' | 'real_estate' | null
  lodging_property_id uuid,
  lodging_owner_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  paid_out boolean NOT NULL DEFAULT false,
  reward_applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS travel_trips_character_idx ON travel_trips (character_id, created_at DESC);
CREATE INDEX IF NOT EXISTS travel_trips_active_idx ON travel_trips (character_id, status, end_abs_day);

-- Nhật ký giải trí (tùy chọn đối soát; giới hạn theo character_wellness_daily.entertainment_counts)
CREATE TABLE IF NOT EXISTS entertainment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  activity_code text NOT NULL,
  game_year int NOT NULL,
  game_day int NOT NULL,
  minute_of_day int,
  cost_minor bigint NOT NULL DEFAULT 0,
  duration_minutes int NOT NULL DEFAULT 0,
  energy_gain int NOT NULL DEFAULT 0,
  seasonal boolean NOT NULL DEFAULT false,
  season text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS entertainment_logs_character_idx ON entertainment_logs (character_id, created_at DESC);

COMMIT;
