BEGIN;
ALTER TABLE auctions DROP COLUMN IF EXISTS estate_asset_id;
ALTER TABLE auctions DROP COLUMN IF EXISTS source;
DROP TABLE IF EXISTS unclaimed_estate_assets;
COMMIT;
