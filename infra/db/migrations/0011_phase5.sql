-- Phase 5: Chợ đen & thám tử (underworld)
--
-- Bảng bổ sung:
-- - underworld_evidences: bằng chứng thám tử thu thập (có thể bán / tống tiền / nộp tòa)
-- - sting_operations: gài bẫy bằng tiền đánh dấu (sting)
-- - insurance_policies: bảo hiểm / thuê vệ sĩ (phòng thủ)
-- - police_sweeps: Đại án Công an (càn quét khi heat manhunt)
-- Blackmail / heat / giấy tờ giả dùng lại bảng sẵn: blackmail_contracts,
-- heat_events, fake_credentials, mercenary_orders.

BEGIN;

CREATE TABLE IF NOT EXISTS underworld_evidences (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_character_id   uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  target_character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  strength             integer NOT NULL CHECK (strength BETWEEN 0 AND 100),
  description          text NOT NULL DEFAULT '',
  status               text NOT NULL DEFAULT 'held'
                       CHECK (status IN ('held', 'sold', 'used', 'submitted')),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS underworld_evidences_owner_idx
  ON underworld_evidences (owner_character_id, status);

CREATE TABLE IF NOT EXISTS sting_operations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id       uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  target_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  amount_minor       bigint NOT NULL CHECK (amount_minor > 0),
  result             text NOT NULL DEFAULT 'pending'
                     CHECK (result IN ('pending', 'caught', 'failed')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  resolved_at        timestamptz
);

CREATE INDEX IF NOT EXISTS sting_operations_character_idx
  ON sting_operations (character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS insurance_policies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id        uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  kind                text NOT NULL CHECK (kind IN ('bodyguard', 'insurance')),
  coverage_amount_minor bigint NOT NULL CHECK (coverage_amount_minor >= 0),
  premium_minor       bigint NOT NULL CHECK (premium_minor >= 0),
  status              text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'expired')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '1 year'
);

CREATE INDEX IF NOT EXISTS insurance_policies_character_idx
  ON insurance_policies (character_id, status);

CREATE TABLE IF NOT EXISTS police_sweeps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id  uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  trigger_heat  integer NOT NULL CHECK (trigger_heat BETWEEN 0 AND 100),
  fine_minor    bigint NOT NULL DEFAULT 0 CHECK (fine_minor >= 0),
  prison_days   integer NOT NULL DEFAULT 0 CHECK (prison_days >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS police_sweeps_character_idx
  ON police_sweeps (character_id, created_at DESC);

COMMIT;
