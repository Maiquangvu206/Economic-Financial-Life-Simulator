-- 0032: Tài sản vô chủ & đấu giá di sản (Pha 4 nền tảng)
BEGIN;

-- Lô tài sản vô chủ đưa ra đấu giá (BĐS, cổ phần, khác). Tiền mặt vô chủ nộp thẳng ngân sách.
CREATE TABLE IF NOT EXISTS unclaimed_estate_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid REFERENCES inheritance_settlements (id) ON DELETE SET NULL,
  deceased_character_id uuid,
  asset_type text NOT NULL CHECK (asset_type IN ('property','shares','cash','other')),
  asset_ref_id uuid, -- properties.id, company/share ref, ...
  company_id uuid REFERENCES companies (id) ON DELETE SET NULL,
  quantity_minor bigint NOT NULL DEFAULT 0, -- số tiền hoặc số cổ phần
  starting_price_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','auctioned','liquidated','paid','cancelled')),
  auction_id uuid REFERENCES auctions (id) ON DELETE SET NULL,
  treasury_paid_minor bigint NOT NULL DEFAULT 0,
  bank_paid_minor bigint NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unclaimed_estate_assets_status_idx ON unclaimed_estate_assets (status);
CREATE INDEX IF NOT EXISTS unclaimed_estate_assets_settlement_idx ON unclaimed_estate_assets (settlement_id);

-- Cho phép phiên đấu giá do hệ thống/AI GM tạo cho tài sản vô chủ (seller có thể là system, không gắn chủ cũ)
-- auctions.seller_character_id hiện NOT NULL + FK cascade; giữ nguyên nhưng dùng system character làm seller.
-- Ghi chú nguồn gốc phiên đấu giá di sản
ALTER TABLE auctions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS estate_asset_id uuid REFERENCES unclaimed_estate_assets (id) ON DELETE SET NULL;

COMMIT;
