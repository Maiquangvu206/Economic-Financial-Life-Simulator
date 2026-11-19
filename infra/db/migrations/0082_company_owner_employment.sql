-- 0082_company_owner_employment.sql
-- Chủ doanh nghiệp được coi là công việc và nhận lương (cấu hình), chi trả định kỳ từ quỹ công ty.
-- Forward-only, idempotent.

BEGIN;

-- Gắn cờ nhận diện vai trò chủ DN trên việc làm/công việc (phục vụ trả lương từ quỹ công ty, hiển thị).
ALTER TABLE IF EXISTS employments
  ADD COLUMN IF NOT EXISTS is_owner_role boolean NOT NULL DEFAULT false;

ALTER TABLE IF EXISTS jobs
  ADD COLUMN IF NOT EXISTS is_owner_role boolean NOT NULL DEFAULT false;

-- Cấu hình lương chủ DN theo từng công ty + liên kết employment đang hoạt động (nếu có).
ALTER TABLE IF EXISTS companies
  ADD COLUMN IF NOT EXISTS owner_salary_minor bigint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_owner_salary_minor_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_owner_salary_minor_check CHECK (owner_salary_minor >= 0);
  END IF;
END $$;

ALTER TABLE IF EXISTS companies
  ADD COLUMN IF NOT EXISTS owner_job_title text NOT NULL DEFAULT 'Chủ doanh nghiệp';

ALTER TABLE IF EXISTS companies
  ADD COLUMN IF NOT EXISTS owner_employment_id uuid NULL REFERENCES employments(id) ON DELETE SET NULL;

-- Job nội bộ cho vai trò chủ DN (không đăng tuyển công khai). Dùng để thỏa FK employments.job_id.
-- Mỗi công ty tối đa 1 job chủ DN.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_owner_role_company_uidx
  ON jobs (employer_company_id)
  WHERE is_owner_role = true AND employer_company_id IS NOT NULL;

-- Hỗ trợ tra cứu employment chủ DN đang active theo công ty.
CREATE INDEX IF NOT EXISTS employments_owner_role_company_active_idx
  ON employments (company_id)
  WHERE is_owner_role = true AND status = 'active';

COMMIT;
