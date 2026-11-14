BEGIN;

-- Bổ sung thông tin lô/tỉnh cho bất động sản (đất)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS lot_number text,
  ADD COLUMN IF NOT EXISTS province text;

-- Bảng giá/điều khoản cho thuê do chủ sở hữu quản lý
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS rent_listing_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rent_deposit_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rent_notes text;

-- Ghi chú/listing bán (trao đổi/chốt giá)
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS sale_notes text;

-- Lời đề nghị mua/trao đổi giá giữa người mua và người bán
CREATE TABLE IF NOT EXISTS property_sale_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  buyer_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  seller_character_id uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled','expired')),
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS property_sale_offers_property_idx ON property_sale_offers(property_id, status);
CREATE INDEX IF NOT EXISTS property_sale_offers_buyer_idx ON property_sale_offers(buyer_character_id);

INSERT INTO schema_migrations (filename) VALUES ('0021_real_estate_enhancements.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;

