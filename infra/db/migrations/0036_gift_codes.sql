-- 0036: Gift codes (admin creates/manages, users redeem) - linked admin <-> user
BEGIN;

CREATE TABLE IF NOT EXISTS gift_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  reward_cash_minor bigint NOT NULL DEFAULT 0 CHECK (reward_cash_minor >= 0),
  max_uses int CHECK (max_uses IS NULL OR max_uses > 0),
  uses_per_account int NOT NULL DEFAULT 1 CHECK (uses_per_account > 0),
  used_count int NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by_actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_codes_code_unique UNIQUE (code),
  CONSTRAINT gift_codes_time_check CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS gift_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_code_id uuid NOT NULL REFERENCES gift_codes (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_code_redemptions_user_unique UNIQUE (gift_code_id, user_id)
);

CREATE INDEX IF NOT EXISTS gift_codes_active_idx ON gift_codes (is_active, updated_at DESC);
CREATE INDEX IF NOT EXISTS gift_codes_code_idx ON gift_codes (code);
CREATE INDEX IF NOT EXISTS gift_code_redemptions_code_idx ON gift_code_redemptions (gift_code_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS gift_code_redemptions_user_idx ON gift_code_redemptions (user_id, redeemed_at DESC);

COMMIT;
