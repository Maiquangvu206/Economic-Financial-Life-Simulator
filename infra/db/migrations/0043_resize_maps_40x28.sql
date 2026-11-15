-- 0043_resize_maps_40x28.sql
-- Mở rộng quy mô tất cả các bản đồ đô thị lên kích thước 40 cột × 28 dòng (1.120 ô đất).
-- Cập nhật metadata và bổ sung các ô đất mới cho bản đồ Hà Nội (001) trong CSDL, bảo toàn dữ liệu ô cũ.

BEGIN;

UPDATE map_meta
SET cols = 40,
    rows = 28,
    version = version + 1,
    updated_at = now()
WHERE id = 1;

-- Bổ sung các ô đất mới phủ đủ lưới 40x28 (0..39, 0..27), các ô cũ từ 0005_map_phase2 được giữ nguyên qua ON CONFLICT (x, y) DO NOTHING
INSERT INTO map_nodes (id, x, y, zone_type, name, land_price_minor)
SELECT gen_random_uuid(), g.x, g.y,
  CASE
    WHEN g.x BETWEEN 35 AND 39 AND g.y BETWEEN 22 AND 27 THEN 'water'
    WHEN g.x BETWEEN 37 AND 39 AND g.y BETWEEN 0 AND 5 THEN 'port'
    WHEN ABS(g.x - 20) + ABS(g.y - 14) < 7 THEN 'commercial'
    WHEN ABS(g.x - 20) + ABS(g.y - 14) < 17 THEN 'residential'
    WHEN g.y < 4 THEN 'civic'
    WHEN g.x < 4 OR g.x > 35 THEN 'industrial'
    WHEN g.x BETWEEN 31 AND 34 AND g.y BETWEEN 7 AND 12 THEN 'slum'
    WHEN (g.x + g.y) % 7 = 0 THEN 'park'
    ELSE 'residential'
  END,
  'Ô [' || g.x || ',' || g.y || ']',
  CASE
    WHEN ABS(g.x - 20) + ABS(g.y - 14) < 7 THEN 180_000_000
    WHEN g.y < 4 THEN 100_000_000
    WHEN g.x BETWEEN 35 AND 39 AND g.y BETWEEN 22 AND 27 THEN 0
    WHEN g.x < 4 OR g.x > 35 THEN 30_000_000
    WHEN ABS(g.x - 20) + ABS(g.y - 14) < 17 THEN 90_000_000
    ELSE 45_000_000
  END
FROM (SELECT x, y FROM generate_series(0, 39) AS x, generate_series(0, 27) AS y) g
ON CONFLICT (x, y) DO NOTHING;

INSERT INTO schema_migrations (filename) VALUES ('0043_resize_maps_40x28.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

