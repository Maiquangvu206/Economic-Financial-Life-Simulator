-- 0083_company_payroll_overhaul.sql
-- Trả lương nhân viên (player employment) và nhân sự AI (company_staff) từ quỹ công ty,
-- ghi nhận chi phí payroll, hỗ trợ nợ lương (arrears), giới hạn/ghi nhận điều chỉnh lương,
-- và dữ liệu phục vụ báo cáo chi phí lương dự kiến.
-- Forward-only, idempotent.

BEGIN;

-- Nợ lương & theo dõi điều chỉnh lương cho việc làm (người chơi) tại công ty
ALTER TABLE IF EXISTS employments
  ADD COLUMN IF NOT EXISTS salary_arrears_minor bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employments_salary_arrears_minor_check'
  ) THEN
    ALTER TABLE employments
      ADD CONSTRAINT employments_salary_arrears_minor_check CHECK (salary_arrears_minor >= 0);
  END IF;
END $$;

ALTER TABLE IF EXISTS employments
  ADD COLUMN IF NOT EXISTS salary_last_changed_at timestamptz NULL;

ALTER TABLE IF EXISTS employments
  ADD COLUMN IF NOT EXISTS salary_change_count integer NOT NULL DEFAULT 0;

-- Nợ lương & theo dõi điều chỉnh lương cho nhân sự AI (company_staff)
ALTER TABLE IF EXISTS company_staff
  ADD COLUMN IF NOT EXISTS salary_arrears_minor bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_staff_salary_arrears_minor_check'
  ) THEN
    ALTER TABLE company_staff
      ADD CONSTRAINT company_staff_salary_arrears_minor_check CHECK (salary_arrears_minor >= 0);
  END IF;
END $$;

ALTER TABLE IF EXISTS company_staff
  ADD COLUMN IF NOT EXISTS salary_last_changed_at timestamptz NULL;

ALTER TABLE IF EXISTS company_staff
  ADD COLUMN IF NOT EXISTS salary_change_count integer NOT NULL DEFAULT 0;

-- Lịch sử điều chỉnh lương (phục vụ audit/giới hạn/báo cáo; không yêu cầu UI bổ sung)
CREATE TABLE IF NOT EXISTS company_payroll_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('employment', 'staff')),
  target_id uuid NOT NULL,
  old_salary_minor bigint NOT NULL CHECK (old_salary_minor >= 0),
  new_salary_minor bigint NOT NULL CHECK (new_salary_minor >= 0),
  changed_by_character_id uuid NULL REFERENCES characters(id) ON DELETE SET NULL,
  reason text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_payroll_adjustments_company_idx
  ON company_payroll_adjustments (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS company_payroll_adjustments_target_idx
  ON company_payroll_adjustments (target_type, target_id, created_at DESC);

COMMIT;
