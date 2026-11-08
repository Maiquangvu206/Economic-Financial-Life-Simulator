-- Phase 2: Bản đồ & Bất động sản (Map / Real Estate)
--
-- - Mở rộng zone_type của map_nodes: thêm 'water', 'park'
-- - Thêm land_price_minor (giá đất theo m², VNĐ minor units) cho mỗi ô
-- - Bảng map_roads: đường giao thông mỗi ô (per-cell roads)
-- - Bảng map_meta: phiên bản bản đồ (version, cols, rows)
-- - Seed bản đồ 32×20 (640 ô) nếu chưa có dữ liệu

BEGIN;

-- 1. Mở rộng danh sách loại vùng cho map_nodes
ALTER TABLE map_nodes
  DROP CONSTRAINT IF EXISTS map_nodes_zone_type_check;
ALTER TABLE map_nodes
  ADD CONSTRAINT map_nodes_zone_type_check
    CHECK (zone_type IN (
      'residential', 'commercial', 'industrial', 'civic', 'port', 'slum', 'water', 'park'
    ));

-- 2. Giá đất theo m² (VNĐ minor units) cho mỗi ô bản đồ
ALTER TABLE map_nodes
  ADD COLUMN IF NOT EXISTS land_price_minor bigint NOT NULL DEFAULT 0
    CHECK (land_price_minor >= 0);

-- 3. Đường giao thông mỗi ô (per-cell roads)
CREATE TABLE IF NOT EXISTS map_roads (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id   uuid NOT NULL REFERENCES map_nodes (id) ON DELETE CASCADE,
  road_type text NOT NULL
            CHECK (road_type IN ('highway', 'arterial', 'local', 'bridge', 'none')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id)
);

-- 4. Phiên bản bản đồ
CREATE TABLE IF NOT EXISTS map_meta (
  id           integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  version      integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  cols         integer NOT NULL CHECK (cols > 0),
  rows         integer NOT NULL CHECK (rows > 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 5. Seed bản đồ 32×20 (640 ô) nếu bảng chưa có dữ liệu.
--    Idempotent: ON CONFLICT (x, y) DO NOTHING bỏ qua ô đã có.
INSERT INTO map_nodes (id, x, y, zone_type, name, land_price_minor)
SELECT gen_random_uuid(), g.x, g.y,
  CASE
    WHEN g.x BETWEEN 28 AND 31 AND g.y BETWEEN 15 AND 19 THEN 'water'
    WHEN g.x BETWEEN 30 AND 31 AND g.y BETWEEN 0 AND 4 THEN 'port'
    WHEN ABS(g.x - 16) + ABS(g.y - 10) < 6 THEN 'commercial'
    WHEN ABS(g.x - 16) + ABS(g.y - 10) < 13 THEN 'residential'
    WHEN g.y < 3 THEN 'civic'
    WHEN g.x < 3 OR g.x > 28 THEN 'industrial'
    WHEN g.x BETWEEN 25 AND 27 AND g.y BETWEEN 5 AND 9 THEN 'slum'
    WHEN (g.x + g.y) % 7 = 0 THEN 'park'
    ELSE 'residential'
  END,
  'Ô [' || g.x || ',' || g.y || ']',
  CASE
    WHEN ABS(g.x - 16) + ABS(g.y - 10) < 6 THEN 180_000_000
    WHEN g.y < 3 THEN 100_000_000
    WHEN g.x BETWEEN 28 AND 31 AND g.y BETWEEN 15 AND 19 THEN 0
    WHEN g.x < 3 OR g.x > 28 THEN 30_000_000
    WHEN ABS(g.x - 16) + ABS(g.y - 10) < 13 THEN 90_000_000
    ELSE 45_000_000
  END
FROM (SELECT x, y FROM generate_series(0, 31) AS x, generate_series(0, 19) AS y) g
ON CONFLICT (x, y) DO NOTHING;

INSERT INTO map_meta (id, version, cols, rows)
VALUES (1, 1, 32, 20)
ON CONFLICT (id) DO NOTHING;

COMMIT;
