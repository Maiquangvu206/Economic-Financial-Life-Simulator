-- Phase 2 follow-up: thêm cột thời gian vào map_nodes để upsert bản đồ hoạt động.
-- Bảng map_nodes từ migration 0002 chỉ có (id, x, y, zone_type, name).

ALTER TABLE map_nodes
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE map_nodes
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Cập nhật lại cột thời gian cho các ô đã tồn tại trước khi migration chạy.
UPDATE map_nodes
SET updated_at = now()
WHERE updated_at IS NULL;

COMMIT;
