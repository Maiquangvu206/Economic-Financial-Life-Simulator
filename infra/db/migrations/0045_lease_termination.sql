-- 0045_lease_termination.sql
-- Bổ sung thông tin kỳ hạn/cọc cho hợp đồng thuê và hỗ trợ hủy trước hạn.
-- Forward-only, idempotent.
BEGIN;

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS deposit_minor bigint NOT NULL DEFAULT 0 CHECK (deposit_minor >= 0),
  ADD COLUMN IF NOT EXISTS term_months integer NOT NULL DEFAULT 12 CHECK (term_months >= 1),
  ADD COLUMN IF NOT EXISTS terminated_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminated_by_character_id uuid REFERENCES characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS termination_penalty_minor bigint NOT NULL DEFAULT 0 CHECK (termination_penalty_minor >= 0),
  ADD COLUMN IF NOT EXISTS termination_note text;

-- Backfill kỳ hạn/kết thúc hợp đồng và cọc cho các hợp đồng đang hoạt động (best-effort)
UPDATE leases l
SET
  deposit_minor = CASE WHEN COALESCE(l.deposit_minor, 0) = 0 THEN COALESCE(p.rent_deposit_minor, 0) ELSE l.deposit_minor END,
  ends_at = COALESCE(l.ends_at, l.started_at + ((COALESCE(NULLIF(l.term_months, 0), 12)::text || ' months')::interval)),
  term_months = COALESCE(NULLIF(l.term_months, 0), 12),
  next_due_at = CASE
    WHEN l.next_due_at IS NULL OR l.next_due_at < l.started_at THEN l.started_at + interval '1 month'
    ELSE l.next_due_at
  END
FROM properties p
WHERE p.id = l.property_id
  AND l.status = 'active';

INSERT INTO schema_migrations (filename) VALUES ('0045_lease_termination.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
