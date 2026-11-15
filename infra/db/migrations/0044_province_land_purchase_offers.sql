-- 0044_province_land_purchase_offers.sql
-- Đề xuất mua đất/công trình theo tỉnh (province_land_properties).
-- Forward-only, idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS province_land_purchase_offers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid NOT NULL REFERENCES province_land_properties(id) ON DELETE CASCADE,
  province_code         text NOT NULL,
  buyer_character_id    uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  seller_character_id   uuid NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  amount_minor          bigint NOT NULL CHECK (amount_minor > 0),
  status                text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected','cancelled','expired')),
  message               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  resolved_at           timestamptz
);

CREATE INDEX IF NOT EXISTS province_land_purchase_offers_property_idx
  ON province_land_purchase_offers(property_id, status);
CREATE INDEX IF NOT EXISTS province_land_purchase_offers_buyer_idx
  ON province_land_purchase_offers(buyer_character_id, status);
CREATE INDEX IF NOT EXISTS province_land_purchase_offers_seller_idx
  ON province_land_purchase_offers(seller_character_id, status);

COMMIT;
