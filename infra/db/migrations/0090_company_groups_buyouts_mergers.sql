-- Pha 1: Tập đoàn (company groups), Pha 2: Buyout 100%, Pha 3: Sáp nhập công ty (A -> B)

-- === Companies: trạng thái sáp nhập ===
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS merged_into_company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merged_at timestamptz;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'companies_status_check') THEN
    ALTER TABLE companies DROP CONSTRAINT companies_status_check;
  END IF;
  ALTER TABLE companies
    ADD CONSTRAINT companies_status_check CHECK (status IN ('active', 'bankrupt', 'ipo', 'merged'));
END $$;

CREATE INDEX IF NOT EXISTS companies_merged_into_idx ON companies (merged_into_company_id) WHERE merged_into_company_id IS NOT NULL;

-- === Pha 1: Tập đoàn ===
CREATE TABLE IF NOT EXISTS company_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  holding_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  owner_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dissolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  dissolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS company_groups_owner_idx ON company_groups (owner_character_id, status);
CREATE INDEX IF NOT EXISTS company_groups_holding_idx ON company_groups (holding_company_id);

CREATE TABLE IF NOT EXISTS company_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES company_groups (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'subsidiary' CHECK (role IN ('holding', 'subsidiary', 'affiliate')),
  control_pct numeric(7,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS company_group_members_active_company_uidx
  ON company_group_members (company_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS company_group_members_group_idx ON company_group_members (group_id, status);

-- === Pha 2: Buyout 100% (tender offer mua cổ phần hiện hữu từ cổ đông) ===
CREATE TABLE IF NOT EXISTS company_buyout_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  acquirer_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  price_per_share_minor bigint NOT NULL CHECK (price_per_share_minor > 0),
  target_shares bigint NOT NULL DEFAULT 0 CHECK (target_shares >= 0),
  acquired_shares bigint NOT NULL DEFAULT 0 CHECK (acquired_shares >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled', 'expired')),
  allow_squeeze_out boolean NOT NULL DEFAULT true,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  note text,
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS company_buyout_offers_company_idx ON company_buyout_offers (company_id, status, ends_at DESC);
CREATE INDEX IF NOT EXISTS company_buyout_offers_acquirer_idx ON company_buyout_offers (acquirer_character_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS company_buyout_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES company_buyout_offers (id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  seller_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  buyer_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  shares bigint NOT NULL CHECK (shares > 0),
  price_per_share_minor bigint NOT NULL CHECK (price_per_share_minor > 0),
  total_cost_minor bigint NOT NULL CHECK (total_cost_minor > 0),
  is_squeeze_out boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_buyout_purchases_offer_idx ON company_buyout_purchases (offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS company_buyout_purchases_seller_idx ON company_buyout_purchases (seller_character_id, created_at DESC);

-- === Pha 3: Sáp nhập (A -> B) ===
CREATE TABLE IF NOT EXISTS company_mergers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survivor_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  merged_company_id uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  executed_by_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  cash_transferred_minor bigint NOT NULL DEFAULT 0,
  staff_transferred integer NOT NULL DEFAULT 0,
  employments_transferred integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merged_company_id)
);

CREATE INDEX IF NOT EXISTS company_mergers_survivor_idx ON company_mergers (survivor_company_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS company_mergers_executor_idx ON company_mergers (executed_by_character_id, executed_at DESC);
