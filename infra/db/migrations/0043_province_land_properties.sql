-- 0043_province_land_properties.sql
-- Quyền sở hữu & xây dựng/hợp thửa đất theo từng tỉnh (áp dụng cho bản đồ sinh động).
-- Forward-only, idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS province_land_properties (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  province_code            text NOT NULL,
  node_x                   integer NOT NULL CHECK (node_x >= 0),
  node_y                   integer NOT NULL CHECK (node_y >= 0),
  zone_type                text NOT NULL,
  node_name                text NOT NULL,
  owner_character_id       uuid REFERENCES characters (id) ON DELETE SET NULL,
  status                   text NOT NULL DEFAULT 'owned'
                           CHECK (status IN ('owned','listed','auction')),
  purchase_price_minor     bigint NOT NULL DEFAULT 0 CHECK (purchase_price_minor >= 0),
  current_value_minor      bigint NOT NULL DEFAULT 0 CHECK (current_value_minor >= 0),
  monthly_rent_minor       bigint NOT NULL DEFAULT 0 CHECK (monthly_rent_minor >= 0),
  property_type            text NOT NULL DEFAULT 'land'
                           CHECK (property_type = ANY (ARRAY[
                             'land','house','apartment','office','warehouse','shop','garage',
                             'mini_apartment','boutique_hotel','shopping_center','office_tower'
                           ]::text[])),
  construction_option      text,
  construction_label       text,
  construction_tier        text,
  construction_multiplier  numeric(8,3) NOT NULL DEFAULT 1,
  construction_cost_minor  bigint NOT NULL DEFAULT 0,
  construction_built_at    timestamptz,
  merged_into_property_id  uuid REFERENCES province_land_properties(id) ON DELETE SET NULL,
  merge_group_id           uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (province_code, node_x, node_y)
);

CREATE INDEX IF NOT EXISTS province_land_properties_owner_idx
  ON province_land_properties (owner_character_id);
CREATE INDEX IF NOT EXISTS province_land_properties_province_idx
  ON province_land_properties (province_code);
CREATE INDEX IF NOT EXISTS province_land_properties_merge_group_idx
  ON province_land_properties (merge_group_id);

COMMIT;
