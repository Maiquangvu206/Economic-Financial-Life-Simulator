BEGIN;
DROP TABLE IF EXISTS property_sale_offers;
ALTER TABLE properties
  DROP COLUMN IF EXISTS sale_notes,
  DROP COLUMN IF EXISTS rent_notes,
  DROP COLUMN IF EXISTS rent_deposit_minor,
  DROP COLUMN IF EXISTS rent_listing_active,
  DROP COLUMN IF EXISTS province,
  DROP COLUMN IF EXISTS lot_number;
DELETE FROM schema_migrations WHERE version = '0021_real_estate_enhancements';
COMMIT;
