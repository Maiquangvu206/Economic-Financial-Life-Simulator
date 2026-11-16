-- 0062_resize_maps_50x38_rebalance.sql
-- Resize core (Hà Nội) map to 50x38 and rebalance zone allocation for all cells.
-- Preserves existing map_nodes IDs/references (properties/logistics/roads). Forward-only.

BEGIN;

UPDATE map_meta
SET cols = 50,
    rows = 38,
    version = version + 1,
    updated_at = now()
WHERE id = 1;

-- 1) Insert missing nodes for full 50x38 grid
INSERT INTO map_nodes (id, x, y, zone_type, name, land_price_minor)
SELECT gen_random_uuid(), g.x, g.y,
  CASE
    -- Water/port edge (river/harbor strip) - small, on southeast edge
    WHEN g.x >= 46 AND g.y >= 30 THEN 'water'
    WHEN g.x >= 45 AND g.y <= 4 THEN 'port'
    -- CBD / commercial core
    WHEN ABS(g.x - 25) + ABS(g.y - 19) <= 6 THEN 'commercial'
    WHEN ABS(g.x - 25) + ABS(g.y - 19) <= 9 AND ((g.x + g.y) % 3 = 0) THEN 'civic'
    -- Civic/government ring
    WHEN g.y <= 4 AND g.x BETWEEN 8 AND 41 THEN 'civic'
    WHEN ABS(g.x - 25) + ABS(g.y - 19) <= 12 AND ((g.x + 2*g.y) % 5 = 0) THEN 'civic'
    -- Parks distributed
    WHEN ((g.x * 7 + g.y * 11) % 17 = 0) AND ABS(g.x - 25) + ABS(g.y - 19) > 8 THEN 'park'
    -- Industrial belts (west/east edges and a south band)
    WHEN g.x <= 3 OR g.x >= 43 THEN 'industrial'
    WHEN g.y >= 33 AND g.x BETWEEN 10 AND 40 THEN 'industrial'
    -- Limited slum pockets
    WHEN ((g.x * 13 + g.y * 5) % 23 = 0) AND g.y >= 20 AND ABS(g.x - 25) + ABS(g.y - 19) > 12 THEN 'slum'
    -- Residential bands
    WHEN ABS(g.x - 25) + ABS(g.y - 19) <= 18 THEN 'residential'
    WHEN ((g.x + g.y) % 4 = 0) THEN 'commercial'
    ELSE 'residential'
  END AS zone_type,
  'Ô [' || g.x || ',' || g.y || '] Hà Nội' AS name,
  CASE
    WHEN ABS(g.x - 25) + ABS(g.y - 19) <= 6 THEN 220000000
    WHEN g.y <= 4 AND g.x BETWEEN 8 AND 41 THEN 120000000
    WHEN g.x >= 46 AND g.y >= 30 THEN 0
    WHEN g.x <= 3 OR g.x >= 43 OR (g.y >= 33 AND g.x BETWEEN 10 AND 40) THEN 40000000
    WHEN ABS(g.x - 25) + ABS(g.y - 19) <= 18 THEN 100000000
    WHEN ((g.x * 7 + g.y * 11) % 17 = 0) THEN 70000000
    ELSE 55000000
  END AS land_price_minor
FROM (SELECT x, y FROM generate_series(0, 49) AS x, generate_series(0, 37) AS y) g
ON CONFLICT (x, y) DO NOTHING;

-- 2) Rebalance zones for all existing & new nodes (deterministic 50x38 scheme)
--    but never turn nodes referenced by properties/logistics into water.
WITH scheme AS (
  SELECT n.id, n.x, n.y,
    CASE
      WHEN n.x >= 46 AND n.y >= 30 THEN 'water'
      WHEN n.x >= 45 AND n.y <= 4 THEN 'port'
      WHEN ABS(n.x - 25) + ABS(n.y - 19) <= 6 THEN 'commercial'
      WHEN ABS(n.x - 25) + ABS(n.y - 19) <= 9 AND ((n.x + n.y) % 3 = 0) THEN 'civic'
      WHEN n.y <= 4 AND n.x BETWEEN 8 AND 41 THEN 'civic'
      WHEN ABS(n.x - 25) + ABS(n.y - 19) <= 12 AND ((n.x + 2*n.y) % 5 = 0) THEN 'civic'
      WHEN ((n.x * 7 + n.y * 11) % 17 = 0) AND ABS(n.x - 25) + ABS(n.y - 19) > 8 THEN 'park'
      WHEN n.x <= 3 OR n.x >= 43 THEN 'industrial'
      WHEN n.y >= 33 AND n.x BETWEEN 10 AND 40 THEN 'industrial'
      WHEN ((n.x * 13 + n.y * 5) % 23 = 0) AND n.y >= 20 AND ABS(n.x - 25) + ABS(n.y - 19) > 12 THEN 'slum'
      WHEN ABS(n.x - 25) + ABS(n.y - 19) <= 18 THEN 'residential'
      WHEN ((n.x + n.y) % 4 = 0) THEN 'commercial'
      ELSE 'residential'
    END AS zone_type,
    CASE
      WHEN ABS(n.x - 25) + ABS(n.y - 19) <= 6 THEN 220000000
      WHEN n.y <= 4 AND n.x BETWEEN 8 AND 41 THEN 120000000
      WHEN n.x >= 46 AND n.y >= 30 THEN 0
      WHEN n.x <= 3 OR n.x >= 43 OR (n.y >= 33 AND n.x BETWEEN 10 AND 40) THEN 40000000
      WHEN ABS(n.x - 25) + ABS(n.y - 19) <= 18 THEN 100000000
      WHEN ((n.x * 7 + n.y * 11) % 17 = 0) THEN 70000000
      ELSE 55000000
    END AS land_price_minor,
    (EXISTS (SELECT 1 FROM properties p WHERE p.node_id = n.id)
     OR EXISTS (SELECT 1 FROM logistics_nodes l WHERE l.node_id = n.id)) AS referenced
  FROM map_nodes n
  WHERE n.x BETWEEN 0 AND 49 AND n.y BETWEEN 0 AND 37
)
UPDATE map_nodes n
SET zone_type = CASE
      WHEN s.referenced AND s.zone_type = 'water' THEN
        CASE
          WHEN n.x >= 45 AND n.y <= 4 THEN 'port'
          WHEN n.x <= 3 OR n.x >= 43 OR n.y >= 33 THEN 'industrial'
          ELSE 'residential'
        END
      ELSE s.zone_type
    END,
    name = 'Ô [' || n.x || ',' || n.y || '] Hà Nội',
    land_price_minor = CASE WHEN s.zone_type = 'water' AND NOT (s.referenced AND s.zone_type = 'water') THEN 0 ELSE s.land_price_minor END,
    updated_at = now()
FROM scheme s
WHERE n.id = s.id;

INSERT INTO schema_migrations (filename) VALUES ('0062_resize_maps_50x38_rebalance.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
