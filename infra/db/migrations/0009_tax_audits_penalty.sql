-- Phase 4 fix: tax_audits thiếu cột penalty_minor (code TaxService dùng).
BEGIN;

ALTER TABLE tax_audits ADD COLUMN IF NOT EXISTS penalty_minor bigint NOT NULL DEFAULT 0;

COMMIT;
