-- Rollback 0017
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_property_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_property_type_check
  CHECK (property_type IN ('apartment', 'house', 'office', 'warehouse', 'port_berth'));
