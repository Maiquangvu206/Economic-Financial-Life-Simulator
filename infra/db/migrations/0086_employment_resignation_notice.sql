-- 0086_employment_resignation_notice.sql
-- Thôi việc có báo trước (notice_pending), thời điểm hiệu lực theo ngày game,
-- và hỗ trợ tính lương prorate khi kết thúc hợp đồng.
-- Forward-only, idempotent.
BEGIN;

-- Cho phép trạng thái notice_pending trong employments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employments_status_check') THEN
    ALTER TABLE employments DROP CONSTRAINT employments_status_check;
  END IF;
END $$;

ALTER TABLE employments
  ADD CONSTRAINT employments_status_check
  CHECK (status IN ('active', 'notice_pending', 'resigned', 'fired'));

-- Thời điểm yêu cầu nghỉ và ngày game có hiệu lực (year*360 + dayOfYear của game_state)
ALTER TABLE employments
  ADD COLUMN IF NOT EXISTS resign_requested_at timestamptz NULL;

ALTER TABLE employments
  ADD COLUMN IF NOT EXISTS effective_resign_game_year integer NULL;

ALTER TABLE employments
  ADD COLUMN IF NOT EXISTS effective_resign_game_day integer NULL;

-- Kỳ lương tháng game đã chốt trả (YYYY-MM) để tránh trả trùng khi prorate kết thúc hợp đồng
ALTER TABLE employments
  ADD COLUMN IF NOT EXISTS last_salary_period_key text NULL;

-- Một nhân vật chỉ có 1 việc làm đang active hoặc đang báo trước nghỉ
DROP INDEX IF EXISTS employments_one_active_idx;
CREATE UNIQUE INDEX IF NOT EXISTS employments_one_active_idx
  ON employments (character_id) WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS employments_one_current_idx
  ON employments (character_id) WHERE status IN ('active', 'notice_pending');

INSERT INTO schema_migrations (filename) VALUES ('0086_employment_resignation_notice.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
