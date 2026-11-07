-- EFLS gameplay schema (0002).
--
-- Bounded contexts: ledger, banking, careers/education, corporations,
-- stock market, real estate, law, underworld, logistics, tax, notifications
-- and the global game state.
--
-- Money is always bigint minor units (cents). Every table owned by a module is
-- documented in services/game-core/src/modules/<module>/README.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Ledger: authoritative double-entry journal for every money movement.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id             uuid PRIMARY KEY,
  owner_type     text NOT NULL
                 CHECK (owner_type IN ('character', 'company', 'bank', 'government', 'market', 'escrow')),
  owner_id       uuid NOT NULL,
  kind           text NOT NULL
                 CHECK (kind IN ('cash', 'savings', 'escrow', 'clearing')),
  currency       text NOT NULL DEFAULT 'USD',
  balance_minor  bigint NOT NULL DEFAULT 0,
  -- System accounts (banks, government, market makers) may run negative.
  is_system      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_type, owner_id, kind, currency)
);

CREATE INDEX IF NOT EXISTS ledger_accounts_owner_idx
  ON ledger_accounts (owner_type, owner_id);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id              uuid PRIMARY KEY,
  kind            text NOT NULL,
  description     text NOT NULL,
  reference_type  text,
  reference_id    uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_transactions_reference_idx
  ON ledger_transactions (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id              uuid PRIMARY KEY,
  transaction_id  uuid NOT NULL REFERENCES ledger_transactions (id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES ledger_accounts (id),
  delta_minor     bigint NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ledger_entries_transaction_idx
  ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS ledger_entries_account_idx
  ON ledger_entries (account_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Banking
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS savings_accounts (
  id               uuid PRIMARY KEY,
  character_id     uuid NOT NULL UNIQUE REFERENCES characters (id) ON DELETE CASCADE,
  balance_minor    bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  annual_rate_pct  numeric(5, 2) NOT NULL DEFAULT 2.50,
  opened_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loans (
  id                    uuid PRIMARY KEY,
  borrower_id           uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  lender_type           text NOT NULL DEFAULT 'bank'
                        CHECK (lender_type IN ('bank', 'player', 'npc')),
  principal_minor       bigint NOT NULL CHECK (principal_minor > 0),
  outstanding_minor     bigint NOT NULL CHECK (outstanding_minor >= 0),
  interest_rate_pct     numeric(5, 2) NOT NULL,
  term_months           integer NOT NULL CHECK (term_months BETWEEN 1 AND 360),
  monthly_payment_minor bigint NOT NULL,
  next_due_at           timestamptz NOT NULL,
  grace_period_end      timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'grace', 'defaulted', 'foreclosed', 'repaid')),
  collateral_property_id uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loans_borrower_idx ON loans (borrower_id, status);
CREATE INDEX IF NOT EXISTS loans_due_idx ON loans (next_due_at) WHERE status IN ('active', 'grace');

CREATE TABLE IF NOT EXISTS loan_payments (
  id              uuid PRIMARY KEY,
  loan_id         uuid NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  amount_minor    bigint NOT NULL CHECK (amount_minor > 0),
  principal_minor bigint NOT NULL,
  interest_minor  bigint NOT NULL,
  on_time         boolean NOT NULL DEFAULT true,
  paid_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_events (
  id           uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  kind         text NOT NULL,
  delta        integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Careers & education
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS universities (
  id              uuid PRIMARY KEY,
  name            text NOT NULL,
  degree_code     text NOT NULL UNIQUE,
  field           text NOT NULL,
  tuition_minor   bigint NOT NULL CHECK (tuition_minor >= 0),
  duration_months integer NOT NULL CHECK (duration_months > 0),
  stat_bonus      jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS degrees (
  id            uuid PRIMARY KEY,
  character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  university_id uuid NOT NULL REFERENCES universities (id),
  degree_code   text NOT NULL,
  status        text NOT NULL DEFAULT 'enrolled'
                CHECK (status IN ('enrolled', 'graduated', 'dropped')),
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  graduates_at  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS degrees_character_idx ON degrees (character_id, status);

CREATE TABLE IF NOT EXISTS jobs (
  id                  uuid PRIMARY KEY,
  title               text NOT NULL,
  industry            text NOT NULL,
  employer_company_id uuid,
  base_salary_minor   bigint NOT NULL CHECK (base_salary_minor >= 0),
  required_degree     text,
  min_credit_score    integer NOT NULL DEFAULT 0,
  energy_cost         integer NOT NULL DEFAULT 10,
  openings            integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS employments (
  id           uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  job_id       uuid NOT NULL REFERENCES jobs (id),
  company_id   uuid,
  salary_minor bigint NOT NULL,
  status       text NOT NULL DEFAULT 'active'
               CHECK (status IN ('active', 'resigned', 'fired')),
  hired_at     timestamptz NOT NULL DEFAULT now(),
  ended_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS employments_one_active_idx
  ON employments (character_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Corporations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id                 uuid PRIMARY KEY,
  name               text NOT NULL UNIQUE,
  industry           text NOT NULL,
  owner_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  cash_minor         bigint NOT NULL DEFAULT 0 CHECK (cash_minor >= 0),
  valuation_minor    bigint NOT NULL DEFAULT 0 CHECK (valuation_minor >= 0),
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'bankrupt', 'ipo')),
  ticker_symbol      text UNIQUE,
  founded_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS companies_owner_idx ON companies (owner_character_id);

CREATE TABLE IF NOT EXISTS company_shareholders (
  id                  uuid PRIMARY KEY,
  company_id          uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  holder_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  shares              bigint NOT NULL CHECK (shares >= 0),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, holder_character_id)
);

-- ---------------------------------------------------------------------------
-- Stock market
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stock_tickers (
  id                    uuid PRIMARY KEY,
  company_id            uuid NOT NULL UNIQUE REFERENCES companies (id) ON DELETE CASCADE,
  symbol                text NOT NULL UNIQUE,
  current_price_minor   bigint NOT NULL CHECK (current_price_minor > 0),
  previous_close_minor  bigint NOT NULL CHECK (previous_close_minor > 0),
  total_volume          bigint NOT NULL DEFAULT 0,
  is_ipo                boolean NOT NULL DEFAULT false,
  listed_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_orders (
  id            uuid PRIMARY KEY,
  ticker_id     uuid NOT NULL REFERENCES stock_tickers (id) ON DELETE CASCADE,
  character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  side          text NOT NULL CHECK (side IN ('buy', 'sell')),
  price_minor   bigint NOT NULL CHECK (price_minor > 0),
  amount        integer NOT NULL CHECK (amount > 0),
  filled_amount integer NOT NULL DEFAULT 0 CHECK (filled_amount >= 0),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'partially_filled', 'filled', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_orders_book_idx
  ON stock_orders (ticker_id, side, price_minor, created_at)
  WHERE status IN ('open', 'partially_filled');

CREATE TABLE IF NOT EXISTS stock_trades (
  id                  uuid PRIMARY KEY,
  ticker_id           uuid NOT NULL REFERENCES stock_tickers (id) ON DELETE CASCADE,
  buy_order_id        uuid NOT NULL REFERENCES stock_orders (id),
  sell_order_id       uuid NOT NULL REFERENCES stock_orders (id),
  buyer_character_id  uuid NOT NULL REFERENCES characters (id),
  seller_character_id uuid NOT NULL REFERENCES characters (id),
  price_minor         bigint NOT NULL,
  amount              integer NOT NULL CHECK (amount > 0),
  executed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stock_trades_ticker_idx ON stock_trades (ticker_id, executed_at DESC);

CREATE TABLE IF NOT EXISTS stock_holdings (
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  ticker_id    uuid NOT NULL REFERENCES stock_tickers (id) ON DELETE CASCADE,
  shares       integer NOT NULL DEFAULT 0 CHECK (shares >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, ticker_id)
);

-- ---------------------------------------------------------------------------
-- Real estate
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS map_nodes (
  id        uuid PRIMARY KEY,
  x         integer NOT NULL CHECK (x >= 0),
  y         integer NOT NULL CHECK (y >= 0),
  zone_type text NOT NULL
            CHECK (zone_type IN ('residential', 'commercial', 'industrial', 'civic', 'port', 'slum')),
  name      text NOT NULL,
  UNIQUE (x, y)
);

CREATE TABLE IF NOT EXISTS properties (
  id                  uuid PRIMARY KEY,
  node_id             uuid NOT NULL REFERENCES map_nodes (id),
  owner_character_id  uuid REFERENCES characters (id) ON DELETE SET NULL,
  owner_company_id    uuid REFERENCES companies (id) ON DELETE SET NULL,
  property_type       text NOT NULL
                      CHECK (property_type IN ('apartment', 'house', 'office', 'warehouse', 'port_berth')),
  purchase_price_minor bigint NOT NULL CHECK (purchase_price_minor >= 0),
  current_value_minor  bigint NOT NULL CHECK (current_value_minor >= 0),
  monthly_rent_minor   bigint NOT NULL DEFAULT 0 CHECK (monthly_rent_minor >= 0),
  asking_price_minor   bigint CHECK (asking_price_minor >= 0),
  status               text NOT NULL DEFAULT 'unowned'
                       CHECK (status IN ('unowned', 'owned', 'listed', 'auction')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_owner_idx ON properties (owner_character_id);
CREATE INDEX IF NOT EXISTS properties_status_idx ON properties (status);

CREATE TABLE IF NOT EXISTS leases (
  id                  uuid PRIMARY KEY,
  property_id         uuid NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  tenant_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  monthly_rent_minor  bigint NOT NULL CHECK (monthly_rent_minor > 0),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'ended')),
  started_at          timestamptz NOT NULL DEFAULT now(),
  ends_at             timestamptz,
  next_due_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leases_one_active_idx
  ON leases (property_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- Law
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS court_cases (
  id               uuid PRIMARY KEY,
  defendant_id     uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  plaintiff_type   text NOT NULL DEFAULT 'government'
                   CHECK (plaintiff_type IN ('government', 'company', 'character')),
  crime_type       text NOT NULL
                   CHECK (crime_type IN ('tax_evasion', 'money_laundering', 'fraud', 'forgery',
                                         'blackmail', 'heist', 'sabotage', 'assault')),
  evidence_strength integer NOT NULL DEFAULT 0 CHECK (evidence_strength BETWEEN 0 AND 100),
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'trial', 'closed')),
  verdict          text CHECK (verdict IN ('guilty', 'not_guilty')),
  fine_minor       bigint NOT NULL DEFAULT 0,
  prison_days      integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE INDEX IF NOT EXISTS court_cases_defendant_idx ON court_cases (defendant_id, status);

CREATE TABLE IF NOT EXISTS blackmail_contracts (
  id                     uuid PRIMARY KEY,
  blackmailer_id         uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  target_id              uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  monthly_payment_minor  bigint NOT NULL CHECK (monthly_payment_minor > 0),
  status                 text NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'ended', 'exposed')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  expires_at             timestamptz
);

CREATE TABLE IF NOT EXISTS criminal_records (
  id           uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  crime_type   text NOT NULL,
  fine_minor   bigint NOT NULL DEFAULT 0,
  prison_days  integer NOT NULL DEFAULT 0,
  convicted_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Underworld
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS heat_events (
  id           uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  delta        integer NOT NULL,
  reason       text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS heat_events_character_idx ON heat_events (character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS fake_credentials (
  id           uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  kind         text NOT NULL,
  quality      integer NOT NULL CHECK (quality BETWEEN 0 AND 100),
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mercenary_orders (
  id          uuid PRIMARY KEY,
  client_id   uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  kind        text NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Logistics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS logistics_nodes (
  id        uuid PRIMARY KEY,
  name      text NOT NULL,
  node_type text NOT NULL CHECK (node_type IN ('seaport', 'hub')),
  node_id   uuid REFERENCES map_nodes (id),
  capacity  integer NOT NULL DEFAULT 100 CHECK (capacity >= 0)
);

CREATE TABLE IF NOT EXISTS fleets (
  id           uuid PRIMARY KEY,
  company_id   uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  vehicle_type text NOT NULL,
  capacity     integer NOT NULL CHECK (capacity >= 0),
  upkeep_minor bigint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shipments (
  id             uuid PRIMARY KEY,
  company_id     uuid NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
  origin_id      uuid NOT NULL REFERENCES logistics_nodes (id),
  destination_id uuid NOT NULL REFERENCES logistics_nodes (id),
  cargo          text NOT NULL,
  value_minor    bigint NOT NULL CHECK (value_minor >= 0),
  status         text NOT NULL DEFAULT 'in_transit'
                 CHECK (status IN ('pending', 'in_transit', 'arrived', 'seized')),
  departure_at   timestamptz NOT NULL DEFAULT now(),
  arrival_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS shipments_company_idx ON shipments (company_id, status);

CREATE TABLE IF NOT EXISTS customs_declarations (
  id                  uuid PRIMARY KEY,
  shipment_id         uuid NOT NULL UNIQUE REFERENCES shipments (id) ON DELETE CASCADE,
  declared_value_minor bigint NOT NULL CHECK (declared_value_minor >= 0),
  duty_minor          bigint NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'cleared', 'seized')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Tax
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tax_assessments (
  id                   uuid PRIMARY KEY,
  character_id         uuid REFERENCES characters (id) ON DELETE CASCADE,
  company_id           uuid REFERENCES companies (id) ON DELETE CASCADE,
  tax_year             integer NOT NULL,
  taxable_income_minor bigint NOT NULL CHECK (taxable_income_minor >= 0),
  tax_due_minor        bigint NOT NULL CHECK (tax_due_minor >= 0),
  status               text NOT NULL DEFAULT 'due'
                       CHECK (status IN ('due', 'paid', 'delinquent')),
  due_at               timestamptz NOT NULL,
  paid_at              timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tax_assessments_character_idx
  ON tax_assessments (character_id, tax_year);

CREATE TABLE IF NOT EXISTS tax_audits (
  id           uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  tax_year     integer NOT NULL,
  risk_score   integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  status       text NOT NULL DEFAULT 'open'
               CHECK (status IN ('open', 'cleared', 'penalized')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Notifications & game state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS game_state (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_day  integer NOT NULL DEFAULT 0 CHECK (current_day >= 0),
  current_year integer NOT NULL DEFAULT 1 CHECK (current_year >= 1),
  season       text NOT NULL DEFAULT 'spring'
               CHECK (season IN ('spring', 'summer', 'autumn', 'winter')),
  macro        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS action_log (
  id         uuid PRIMARY KEY,
  actor_id   uuid,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Backfill ledger accounts for characters created before the ledger existed.
-- ---------------------------------------------------------------------------

INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor)
SELECT gen_random_uuid(), 'character', c.id, 'cash', c.cash_minor
FROM characters c
ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING;

INSERT INTO game_state (id, current_day, current_year, season, macro)
VALUES (1, 0, 1, 'spring',
        '{"inflationPct": 2.4, "cpi": 100, "baseRatePct": 5.0, "unemploymentPct": 5.6, "gdpGrowthPct": 2.1}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMIT;
