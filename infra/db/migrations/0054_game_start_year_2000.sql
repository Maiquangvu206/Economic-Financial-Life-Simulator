-- 0054: Mốc khởi đầu hệ thống = 01/01/2000 (năm game bắt đầu từ 2000)
-- Idempotent, forward-only: chỉ dịch năm game cũ (<2000) sang mốc 2000, không reset ngày/tiến trình.
BEGIN;

-- Nếu game_state đang ở năm "chỉ số" cũ (1, 2, ...) thì dịch sang mốc 2000
UPDATE game_state
SET current_year = current_year + 1999,
    updated_at = now()
WHERE id = 1 AND current_year < 2000;

-- Mặc định cột năm game = 2000 cho các lần tạo mới
ALTER TABLE game_state ALTER COLUMN current_year SET DEFAULT 2000;

-- Đồng bộ mốc năm lương thị trưởng đã lưu (nếu còn ở chỉ số cũ)
UPDATE elections
SET salary_last_game_year = salary_last_game_year + 1999
WHERE salary_last_game_year IS NOT NULL AND salary_last_game_year < 2000;

INSERT INTO schema_migrations (filename) VALUES ('0054_game_start_year_2000.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
