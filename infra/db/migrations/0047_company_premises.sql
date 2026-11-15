-- 0047_company_premises.sql
-- Yêu cầu địa điểm/cơ sở khi thành lập công ty:
--  (A) đất nền (core/province) do nhân vật sở hữu để xây dựng công ty
--  (B) bất động sản (phi đất nền, đã xây dựng) thuộc sở hữu của công ty khác làm trụ sở
-- Forward-only, idempotent.

BEGIN;

-- Companies: store selected premises
ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_type text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_province_code text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_core_property_id uuid REFERENCES properties (id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_province_land_property_id uuid REFERENCES province_land_properties (id) ON DELETE SET NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS premises_company_property_id uuid REFERENCES properties (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'companies_premises_type_check'
  ) THEN
    ALTER TABLE companies
      ADD CONSTRAINT companies_premises_type_check
      CHECK (premises_type IS NULL OR premises_type IN ('land_core', 'land_province', 'company_property'));
  END IF;
END $$;

-- Link land/properties to company HQ (prevent reuse as premises)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS hq_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;
ALTER TABLE province_land_properties ADD COLUMN IF NOT EXISTS hq_company_id uuid REFERENCES companies (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_premises_core_property_idx ON companies (premises_core_property_id);
CREATE INDEX IF NOT EXISTS companies_premises_province_land_property_idx ON companies (premises_province_land_property_id);
CREATE INDEX IF NOT EXISTS companies_premises_company_property_idx ON companies (premises_company_property_id);
CREATE INDEX IF NOT EXISTS properties_hq_company_idx ON properties (hq_company_id);
CREATE INDEX IF NOT EXISTS province_land_properties_hq_company_idx ON province_land_properties (hq_company_id);

COMMIT;
