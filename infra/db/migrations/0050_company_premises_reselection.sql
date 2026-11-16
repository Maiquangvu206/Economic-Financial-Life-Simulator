-- 0050: Company HQ relocation required when premises/construction is demolished.
-- Forward-only, idempotent.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_needs_reselection boolean NOT NULL DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_invalid_reason text;

COMMIT;

INSERT INTO schema_migrations (filename) VALUES ('0050_company_premises_reselection.sql') ON CONFLICT DO NOTHING;
