-- 0055: Bỏ cấu hình "chọn mùa" thủ công (seasonOverride); thay bằng cấu hình khoảng thời gian mùa (macro.seasonRanges)
-- Idempotent, forward-only: chỉ xóa khóa cấu hình cũ, không đụng tới ngày/năm game.
BEGIN;

UPDATE game_state
SET macro = (macro - 'seasonOverride'),
    updated_at = now()
WHERE id = 1 AND macro ? 'seasonOverride';

INSERT INTO schema_migrations (filename) VALUES ('0055_remove_season_override.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
