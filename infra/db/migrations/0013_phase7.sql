-- Phase 7 (chính trị): Bầu cử Thị trưởng
--
-- Bảng:
-- - elections / candidates / votes: chính trị & bầu cử
-- (Các bảng phái sinh / xuyên server / spatial đã được loại bỏ theo yêu cầu.)

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

COMMIT;
