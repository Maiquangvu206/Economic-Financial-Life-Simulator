-- Down: Revert Phase 2 map changes (0005_map_phase2.sql)
BEGIN;

DELETE FROM map_roads;
DELETE FROM map_nodes;
DELETE FROM map_meta;

DROP TABLE IF EXISTS map_roads;
DROP TABLE IF EXISTS map_meta;

ALTER TABLE map_nodes DROP COLUMN IF EXISTS land_price_minor;

ALTER TABLE map_nodes
  DROP CONSTRAINT IF EXISTS map_nodes_zone_type_check;
ALTER TABLE map_nodes
  ADD CONSTRAINT map_nodes_zone_type_check
    CHECK (zone_type IN ('residential', 'commercial', 'industrial', 'civic', 'port', 'slum'));

COMMIT;
