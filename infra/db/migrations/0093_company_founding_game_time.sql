-- 0093_company_founding_game_time.sql
-- Ghi nhận thời điểm thành lập công ty theo thời gian game để đồng bộ kỳ tài chính/doanh thu/thuế.

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS founded_game_year integer,
  ADD COLUMN IF NOT EXISTS founded_game_month integer;

-- Backfill an toàn: công ty chưa có kỳ chốt doanh thu thì đặt mốc = thời gian game hiện tại
-- (tránh tạo kỳ tài chính trước thời điểm hiện tại cho công ty mới/legacy chưa có dữ liệu kỳ).
WITH gs AS (
  SELECT current_year::int AS y, current_day::int AS d FROM game_state WHERE id = 1
)
UPDATE companies c
SET founded_game_year = gs.y,
    founded_game_month = (FLOOR(((gs.d % 360) + 360) % 360 / 30.0)::int + 1)
FROM gs
WHERE c.founded_game_year IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_revenue_settlements s WHERE s.company_id = c.id);

INSERT INTO schema_migrations (filename) VALUES ('0093_company_founding_game_time.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
