-- 0053: Bổ sung cột updated_at cho leases (worker tick cập nhật kỳ thuê theo tháng game)
-- Idempotent, forward-only: không xóa dữ liệu, không reset game_state.
BEGIN;

ALTER TABLE leases
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

UPDATE leases SET updated_at = COALESCE(updated_at, started_at, now()) WHERE updated_at IS NULL;

ALTER TABLE leases
  ALTER COLUMN updated_at SET DEFAULT now();

UPDATE leases SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE leases
  ALTER COLUMN updated_at SET NOT NULL;

INSERT INTO schema_migrations (filename) VALUES ('0053_leases_updated_at.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
