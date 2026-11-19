-- 0084_recruitment_player_applications.sql
-- Hồ sơ ứng tuyển việc làm của người chơi (player applicants) cho tin tuyển dụng công ty.
-- Thay vì nhận việc ngay khi ứng tuyển, ứng viên tạo hồ sơ chờ chủ công ty duyệt/từ chối.
-- Forward-only, idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  company_id uuid NULL REFERENCES companies(id) ON DELETE CASCADE,
  applicant_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  note text NULL,
  decision_note text NULL,
  decided_by_character_id uuid NULL REFERENCES characters(id) ON DELETE SET NULL,
  decided_at timestamptz NULL,
  employment_id uuid NULL REFERENCES employments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Mỗi nhân vật chỉ có tối đa 1 hồ sơ pending cho cùng một tin tuyển dụng
CREATE UNIQUE INDEX IF NOT EXISTS job_applications_one_pending_per_applicant_job_idx
  ON job_applications (job_id, applicant_character_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS job_applications_job_status_idx
  ON job_applications (job_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS job_applications_company_status_idx
  ON job_applications (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS job_applications_applicant_idx
  ON job_applications (applicant_character_id, created_at DESC);

COMMIT;
