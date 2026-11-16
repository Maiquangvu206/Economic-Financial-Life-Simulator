-- 0059: Company funding/IPO offering extensions
-- - Retain % of 30-day auto revenue into company cash (owner-configured)
-- - Share offerings for IPO companies (raise capital from market, first-come-first-served)
-- Forward-only, idempotent.

-- 2B: owner-configured retention of auto revenue into company cash (applies to next settlements)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS revenue_retain_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_revenue_retain_pct_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_revenue_retain_pct_check CHECK (revenue_retain_pct >= 0 AND revenue_retain_pct <= 100);
  END IF;
END $$;

-- Settlement audit: how much retained to company vs paid out to owner
ALTER TABLE company_revenue_settlements
  ADD COLUMN IF NOT EXISTS retained_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE company_revenue_settlements
  ADD COLUMN IF NOT EXISTS owner_payout_minor BIGINT NOT NULL DEFAULT 0;

-- 4: IPO share offerings (primary issuance to market, proceeds to company cash)
CREATE TABLE IF NOT EXISTS company_share_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  total_shares BIGINT NOT NULL CHECK (total_shares > 0),
  remaining_shares BIGINT NOT NULL CHECK (remaining_shares >= 0),
  price_per_share_minor BIGINT NOT NULL CHECK (price_per_share_minor > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'completed', 'cancelled')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ NULL,
  CHECK (remaining_shares <= total_shares),
  CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS company_share_offerings_company_idx
  ON company_share_offerings (company_id, status, ends_at DESC);
CREATE INDEX IF NOT EXISTS company_share_offerings_open_idx
  ON company_share_offerings (status, ends_at) WHERE status = 'open';

-- Purchase history (audit)
CREATE TABLE IF NOT EXISTS company_share_offering_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES company_share_offerings(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  buyer_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  shares BIGINT NOT NULL CHECK (shares > 0),
  price_per_share_minor BIGINT NOT NULL CHECK (price_per_share_minor > 0),
  total_cost_minor BIGINT NOT NULL CHECK (total_cost_minor > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_share_offering_purchases_offering_idx
  ON company_share_offering_purchases (offering_id, created_at DESC);
CREATE INDEX IF NOT EXISTS company_share_offering_purchases_buyer_idx
  ON company_share_offering_purchases (buyer_character_id, created_at DESC);
