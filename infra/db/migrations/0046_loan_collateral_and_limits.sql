-- 0046_loan_collateral_and_limits.sql
-- Hỗ trợ vay thế chấp bằng bất động sản hoặc công ty và mở rộng dữ liệu tài sản thế chấp.
-- Forward-only, idempotent.
BEGIN;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS collateral_company_id uuid REFERENCES companies (id),
  ADD COLUMN IF NOT EXISTS collateral_type text;

-- Backfill loại tài sản thế chấp hiện có (BĐS)
UPDATE loans
SET collateral_type = 'property'
WHERE collateral_property_id IS NOT NULL
  AND (collateral_type IS NULL OR collateral_type = '');

-- Ràng buộc: nếu có collateral_type thì phải khớp với id tương ứng (best-effort, idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_collateral_type_check'
  ) THEN
    ALTER TABLE loans
      ADD CONSTRAINT loans_collateral_type_check
      CHECK (
        collateral_type IS NULL
        OR collateral_type IN ('property', 'company')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_collateral_ref_check'
  ) THEN
    ALTER TABLE loans
      ADD CONSTRAINT loans_collateral_ref_check
      CHECK (
        (collateral_type IS NULL AND collateral_property_id IS NULL AND collateral_company_id IS NULL)
        OR (collateral_type = 'property' AND collateral_property_id IS NOT NULL AND collateral_company_id IS NULL)
        OR (collateral_type = 'company' AND collateral_company_id IS NOT NULL AND collateral_property_id IS NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS loans_collateral_company_idx
  ON loans (collateral_company_id)
  WHERE collateral_company_id IS NOT NULL;

INSERT INTO schema_migrations (filename) VALUES ('0046_loan_collateral_and_limits.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
