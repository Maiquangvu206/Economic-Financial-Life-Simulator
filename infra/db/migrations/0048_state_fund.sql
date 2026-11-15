-- 0048: National/state land fund (quỹ đất nước) for taxes, fines, fees, land auctions, welfare, and market support.
-- Idempotent forward-only.

CREATE TABLE IF NOT EXISTS state_fund (
  id           smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance_minor bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO state_fund (id, balance_minor)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS state_fund_transactions (
  id             uuid PRIMARY KEY,
  amount_minor   bigint NOT NULL, -- positive = inflow, negative = outflow
  balance_after  bigint NOT NULL,
  reason_code    text NOT NULL,
  description    text,
  ref_type       text,
  ref_id         text,
  actor_type     text, -- system | admin | mayor | character
  actor_id       text,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS state_fund_tx_created_idx ON state_fund_transactions (created_at DESC);

INSERT INTO schema_migrations (filename)
VALUES ('0048_state_fund.sql')
ON CONFLICT (filename) DO NOTHING;
