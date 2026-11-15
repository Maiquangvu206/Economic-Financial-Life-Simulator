-- 0035: Trạng thái tài khoản (ban/hạn chế), lưu cấu hình OT/macro và tăng tính liên kết admin-user
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'banned', 'restricted')),
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS banned_until timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS users_status_idx ON users (status);

-- Đảm bảo macro trong game_state có các khóa cấu hình mặc định khi chưa có
UPDATE game_state
SET macro = jsonb_strip_nulls(
  COALESCE(macro, '{}'::jsonb) || jsonb_build_object(
    'otRatePercent', COALESCE((macro->>'otRatePercent')::int, 300)
  )
)
WHERE id = 1;

COMMIT;
