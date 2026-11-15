-- 0042_property_construction.sql
-- Hoàn thiện hợp thửa & xây dựng công trình: lưu trạng thái xây dựng/hợp nhất trên BĐS.
-- Forward-only, idempotent.

BEGIN;

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS construction_option text,
  ADD COLUMN IF NOT EXISTS construction_label text,
  ADD COLUMN IF NOT EXISTS construction_tier text,
  ADD COLUMN IF NOT EXISTS construction_multiplier numeric(8,3) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS construction_cost_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS construction_built_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_group_id uuid;

-- Mở rộng loại BĐS để phản ánh công trình xây dựng
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_property_type_check;
ALTER TABLE properties
  ADD CONSTRAINT properties_property_type_check CHECK (property_type = ANY (ARRAY[
    'apartment','house','office','warehouse','port_berth','land',
    'shop','garage','mini_apartment','boutique_hotel','shopping_center','office_tower'
  ]::text[]));

CREATE INDEX IF NOT EXISTS properties_merge_group_idx ON properties (merge_group_id);
CREATE INDEX IF NOT EXISTS properties_merged_into_idx ON properties (merged_into_property_id);

COMMIT;
