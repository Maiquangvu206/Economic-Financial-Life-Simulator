BEGIN;

UPDATE map_meta
SET cols = 32,
    rows = 20,
    version = version + 1,
    updated_at = now()
WHERE id = 1;

DELETE FROM map_nodes WHERE x >= 32 OR y >= 20;

DELETE FROM schema_migrations WHERE filename = '0043_resize_maps_40x28.sql';

COMMIT;

