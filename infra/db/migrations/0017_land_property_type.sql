-- 0017: Cho phép loại bất động sản "đất nền" (mua đất trống theo giá đất do admin đặt).
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_property_type_check;
ALTER TABLE properties ADD CONSTRAINT properties_property_type_check
  CHECK (property_type IN ('apartment', 'house', 'office', 'warehouse', 'port_berth', 'land'));
