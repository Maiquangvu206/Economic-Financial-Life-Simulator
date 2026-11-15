-- 0029: snapshot tài sản tại thời điểm gửi yêu cầu ly hôn (phục vụ phong tỏa & bù trừ tẩu tán)
BEGIN;

CREATE TABLE IF NOT EXISTS divorce_proposal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES divorce_proposals (id) ON DELETE CASCADE,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  cash_minor bigint NOT NULL DEFAULT 0,
  property_value_minor bigint NOT NULL DEFAULT 0,
  property_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  total_minor bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT divorce_proposal_snapshots_unique UNIQUE (proposal_id, character_id)
);
CREATE INDEX IF NOT EXISTS divorce_proposal_snapshots_proposal_idx ON divorce_proposal_snapshots (proposal_id);

COMMIT;
