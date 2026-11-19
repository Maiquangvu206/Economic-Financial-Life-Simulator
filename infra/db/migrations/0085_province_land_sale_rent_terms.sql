-- 0085_province_land_sale_rent_terms.sql
-- Bổ sung cột niêm yết bán/cho thuê cho bất động sản tỉnh (province_land_properties)
-- để đồng bộ thao tác rao bán/bảng giá thuê với BĐS lõi. Forward-only, idempotent.
BEGIN;

ALTER TABLE province_land_properties
  ADD COLUMN IF NOT EXISTS asking_price_minor bigint CHECK (asking_price_minor >= 0),
  ADD COLUMN IF NOT EXISTS sale_notes text,
  ADD COLUMN IF NOT EXISTS rent_listing_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rent_deposit_minor bigint NOT NULL DEFAULT 0 CHECK (rent_deposit_minor >= 0),
  ADD COLUMN IF NOT EXISTS rent_notes text;

INSERT INTO schema_migrations (filename) VALUES ('0085_province_land_sale_rent_terms.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
