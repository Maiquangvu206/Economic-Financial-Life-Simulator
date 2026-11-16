-- 0058: Company operations & stock market overhaul
-- - Industry revenue auto-config + 30-day settlements
-- - Company tax filing refactor (declared revenue, tax from company cash, auto dividend)
-- - Admin stock price controls and audit log
-- Forward-only, idempotent.

-- Admin-configurable revenue rate per industry (30 game days period)
CREATE TABLE IF NOT EXISTS industry_revenue_configs (
  industry_type TEXT PRIMARY KEY,
  monthly_rate_pct NUMERIC(10,4) NOT NULL DEFAULT 0,
  min_revenue_minor BIGINT NOT NULL DEFAULT 0 CHECK (min_revenue_minor >= 0),
  max_revenue_minor BIGINT NOT NULL DEFAULT 0 CHECK (max_revenue_minor >= 0),
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (monthly_rate_pct >= 0),
  CHECK (max_revenue_minor = 0 OR max_revenue_minor >= min_revenue_minor)
);

-- Idempotent 30-day auto revenue settlement per company/period
CREATE TABLE IF NOT EXISTS company_revenue_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  period_key TEXT NOT NULL,
  game_year INT NOT NULL,
  game_month INT NOT NULL,
  base_capital_minor BIGINT NOT NULL DEFAULT 0,
  monthly_rate_pct NUMERIC(10,4) NOT NULL DEFAULT 0,
  season_multiplier NUMERIC(10,4) NOT NULL DEFAULT 1,
  actual_revenue_minor BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'settled',
  settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, period_key)
);
CREATE INDEX IF NOT EXISTS company_revenue_settlements_period_idx ON company_revenue_settlements (period_key, settled_at DESC);

-- Company ledger: mark actual (auto) records and period for audit/settlement
ALTER TABLE company_ledger_entries ADD COLUMN IF NOT EXISTS ledger_kind TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE company_ledger_entries ADD COLUMN IF NOT EXISTS period_key TEXT NULL;
CREATE INDEX IF NOT EXISTS company_ledger_entries_period_idx ON company_ledger_entries (company_id, period_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS company_ledger_entries_kind_idx ON company_ledger_entries (ledger_kind, occurred_at DESC);

-- Tax filing refactor: period-based declared revenue, settlement/dividend/audit state
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS period_key TEXT NULL;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS dividend_pool_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS dividend_distributed_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS dividend_distributed_at TIMESTAMPTZ NULL;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS evasion_gap_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS audit_checked_at TIMESTAMPTZ NULL;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS audit_penalty_minor BIGINT NOT NULL DEFAULT 0;
ALTER TABLE company_tax_filings ADD COLUMN IF NOT EXISTS opex_total_minor BIGINT NOT NULL DEFAULT 0;
-- allow one filing per company per period (latest semantics handled in app; unique when period_key set)
CREATE UNIQUE INDEX IF NOT EXISTS company_tax_filings_company_period_uidx
  ON company_tax_filings (company_id, period_key)
  WHERE period_key IS NOT NULL;

-- Admin stock market adjustment logs
CREATE TABLE IF NOT EXISTS admin_market_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NULL,
  scope TEXT NOT NULL CHECK (scope IN ('ALL_MARKET', 'SPECIFIC_COMPANIES')),
  target_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  mode TEXT NOT NULL CHECK (mode IN ('INSTANT_SHOCK', 'TREND_BIAS')),
  delta_pct NUMERIC(10,4) NOT NULL DEFAULT 0,
  duration_hours INT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_market_logs_created_idx ON admin_market_logs (created_at DESC);

-- Active trend biases applied during hourly tick
CREATE TABLE IF NOT EXISTS stock_market_biases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL CHECK (scope IN ('ALL_MARKET', 'SPECIFIC_COMPANIES')),
  ticker_id UUID NULL REFERENCES stock_tickers(id) ON DELETE CASCADE,
  bias_pct NUMERIC(10,4) NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID NULL,
  log_id UUID NULL REFERENCES admin_market_logs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_market_biases_active_idx ON stock_market_biases (ends_at, ticker_id, scope);

-- Seed default industry revenue configs (idempotent)
INSERT INTO industry_revenue_configs (industry_type, monthly_rate_pct, min_revenue_minor, max_revenue_minor)
VALUES
  ('real_estate', 2.5, 0, 0),
  ('finance_banking', 2.0, 0, 0),
  ('technology_ai', 3.0, 0, 0),
  ('agritech', 1.8, 0, 0),
  ('healthcare_pharma', 2.2, 0, 0),
  ('entertainment_media', 2.4, 0, 0),
  ('logistics', 2.0, 0, 0),
  ('energy_mining', 2.3, 0, 0),
  ('education', 1.6, 0, 0),
  ('underworld_services', 3.5, 0, 0)
ON CONFLICT (industry_type) DO NOTHING;