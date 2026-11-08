-- Phase 7: Mở rộng (GDD Module 1-4)
--
-- - elections / candidates / votes: chính trị & bầu cử (Thị trưởng)
-- - futures_contracts: phái sinh options/futures (long-only, market-made)
-- - cross_server_listings: giao dịch xuyên server (BĐS/cổ phiếu)
-- - spatial_sessions: phiên spatial web / VR-AR

BEGIN;

CREATE TABLE IF NOT EXISTS elections (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  office        text NOT NULL DEFAULT 'mayor' CHECK (office IN ('mayor')),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'ended')),
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL DEFAULT now() + interval '7 days',
  winner_candidate_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elections_status_idx ON elections (status);

CREATE TABLE IF NOT EXISTS candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id   uuid NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  name          text NOT NULL,
  votes         integer NOT NULL DEFAULT 0 CHECK (votes >= 0),
  donations_minor bigint NOT NULL DEFAULT 0 CHECK (donations_minor >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, character_id)
);

CREATE TABLE IF NOT EXISTS votes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id   uuid NOT NULL REFERENCES elections (id) ON DELETE CASCADE,
  voter_id      uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  candidate_id  uuid NOT NULL REFERENCES candidates (id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (election_id, voter_id)
);

CREATE TABLE IF NOT EXISTS futures_contracts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id        uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  ticker_id           uuid NOT NULL REFERENCES stock_tickers (id) ON DELETE CASCADE,
  quantity            integer NOT NULL CHECK (quantity > 0),
  strike_minor        bigint NOT NULL CHECK (strike_minor > 0),
  premium_minor       bigint NOT NULL CHECK (premium_minor >= 0),
  margin_minor        bigint NOT NULL CHECK (margin_minor >= 0),
  expiry_at           timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'settled', 'expired')),
  settlement_price_minor bigint,
  settled_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS futures_contracts_character_idx
  ON futures_contracts (character_id, status);

CREATE TABLE IF NOT EXISTS cross_server_listings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  buyer_character_id  uuid REFERENCES characters (id) ON DELETE SET NULL,
  kind                text NOT NULL CHECK (kind IN ('property', 'shares')),
  asset_id            text NOT NULL,
  asking_price_minor  bigint NOT NULL CHECK (asking_price_minor > 0),
  origin_shard        text NOT NULL DEFAULT 'HN-01',
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'sold', 'cancelled')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  sold_at             timestamptz
);

CREATE INDEX IF NOT EXISTS cross_server_listings_status_idx
  ON cross_server_listings (status, created_at DESC);

CREATE TABLE IF NOT EXISTS spatial_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id           text NOT NULL DEFAULT 'hcmc',
  host_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '1 day',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spatial_presences (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES spatial_sessions (id) ON DELETE CASCADE,
  character_id      uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  x                 integer NOT NULL DEFAULT 0,
  y                 integer NOT NULL DEFAULT 0,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, character_id)
);

COMMIT;
