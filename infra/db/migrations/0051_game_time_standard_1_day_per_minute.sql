-- 0051: Chuẩn hóa thời gian game (1 ngày game = 1 phút thực tế, năm 360 ngày)
-- Đồng bộ game_state về lịch 360 ngày/tháng và mùa theo tháng.
BEGIN;

UPDATE game_state
SET
  current_day = (current_day % 360),
  season = CASE
    WHEN (FLOOR((current_day % 360) / 30) + 1) BETWEEN 2 AND 4 THEN 'spring'
    WHEN (FLOOR((current_day % 360) / 30) + 1) BETWEEN 5 AND 7 THEN 'summer'
    WHEN (FLOOR((current_day % 360) / 30) + 1) BETWEEN 8 AND 10 THEN 'autumn'
    ELSE 'winter'
  END,
  updated_at = now()
WHERE id = 1;

INSERT INTO schema_migrations (filename) VALUES ('0051_game_time_standard_1_day_per_minute.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
