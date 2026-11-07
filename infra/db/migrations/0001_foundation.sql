-- EFLS foundation schema: identity + character + outbox.
-- Domain schemas for banking, real estate, stock market, law, etc. are added
-- by later migrations, each owned by its bounded context.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY,
  email         text NOT NULL,
  username      text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'player'
                CHECK (role IN ('player', 'moderator', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_uidx ON users (lower(username));

CREATE TABLE IF NOT EXISTS characters (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  full_name      text NOT NULL,
  age            integer NOT NULL DEFAULT 18 CHECK (age >= 0),
  health_energy  integer NOT NULL DEFAULT 100 CHECK (health_energy BETWEEN 0 AND 100),
  cash_minor     bigint NOT NULL DEFAULT 0,
  credit_score   integer NOT NULL DEFAULT 650 CHECK (credit_score BETWEEN 300 AND 850),
  heat_level     integer NOT NULL DEFAULT 0 CHECK (heat_level BETWEEN 0 AND 100),
  marital_status text NOT NULL DEFAULT 'single'
                 CHECK (marital_status IN ('single', 'married', 'divorced', 'widowed')),
  spouse_id      uuid REFERENCES characters (id) ON DELETE SET NULL,
  location_x     integer NOT NULL DEFAULT 0 CHECK (location_x >= 0),
  location_y     integer NOT NULL DEFAULT 0 CHECK (location_y >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS characters_user_idx ON characters (user_id);
CREATE INDEX IF NOT EXISTS characters_location_idx ON characters (location_x, location_y);

CREATE TABLE IF NOT EXISTS family_trees (
  id              uuid PRIMARY KEY,
  character_id    uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  parent_id       uuid REFERENCES characters (id) ON DELETE SET NULL,
  generation_level integer NOT NULL DEFAULT 0 CHECK (generation_level >= 0),
  inheritance_pct numeric(5, 2) NOT NULL DEFAULT 0
                  CHECK (inheritance_pct BETWEEN 0 AND 100),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS family_trees_character_idx ON family_trees (character_id);
CREATE INDEX IF NOT EXISTS family_trees_parent_idx ON family_trees (parent_id);

CREATE TABLE IF NOT EXISTS wills (
  id                uuid PRIMARY KEY,
  character_id      uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  primary_heir_id   uuid REFERENCES characters (id) ON DELETE SET NULL,
  trust_fund_enabled boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trust_funds (
  id             uuid PRIMARY KEY,
  character_id   uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  beneficiary_id uuid REFERENCES characters (id) ON DELETE SET NULL,
  balance_minor  bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Transactional outbox: written in the same transaction as domain state.
CREATE TABLE IF NOT EXISTS outbox_events (
  id             uuid PRIMARY KEY,
  type           text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id   text NOT NULL,
  payload        jsonb NOT NULL,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  published_at   timestamptz,
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text
);

CREATE INDEX IF NOT EXISTS outbox_unpublished_idx
  ON outbox_events (occurred_at)
  WHERE published_at IS NULL;

COMMIT;
