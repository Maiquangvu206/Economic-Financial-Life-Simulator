-- 0028: đề xuất hôn nhân & ly hôn cần sự đồng ý của cả hai bên
BEGIN;

CREATE TABLE IF NOT EXISTS marriage_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  target_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  prenup_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT marriage_proposals_not_self CHECK (proposer_character_id <> target_character_id)
);
CREATE INDEX IF NOT EXISTS marriage_proposals_target_idx ON marriage_proposals (target_character_id, status);
CREATE INDEX IF NOT EXISTS marriage_proposals_proposer_idx ON marriage_proposals (proposer_character_id, status);

CREATE TABLE IF NOT EXISTS divorce_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marriage_id uuid NOT NULL REFERENCES marriage_contracts (id) ON DELETE CASCADE,
  requester_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS divorce_proposals_marriage_idx ON divorce_proposals (marriage_id, status);
CREATE INDEX IF NOT EXISTS divorce_proposals_requester_idx ON divorce_proposals (requester_character_id, status);

COMMIT;
