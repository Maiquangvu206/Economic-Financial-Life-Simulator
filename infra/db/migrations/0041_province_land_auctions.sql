-- 0041_province_land_auctions.sql
-- Đấu giá đất theo từng tỉnh/thành (bản đồ sinh động, server-authoritative).
-- Mỗi phiên gắn với province_code + tọa độ ô (x,y) và giá khởi điểm theo cấu hình giá đất.
-- Forward-only, idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS province_land_auctions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  province_code         text NOT NULL,
  node_x                integer NOT NULL CHECK (node_x >= 0),
  node_y                integer NOT NULL CHECK (node_y >= 0),
  zone_type             text NOT NULL,
  node_name             text NOT NULL,
  starting_price_minor  bigint NOT NULL CHECK (starting_price_minor >= 0),
  current_bid_minor     bigint NOT NULL CHECK (current_bid_minor >= 0),
  highest_bidder_id     uuid REFERENCES characters (id) ON DELETE SET NULL,
  ends_at               timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'ended', 'cancelled')),
  winner_id             uuid REFERENCES characters (id) ON DELETE SET NULL,
  settled_price_minor   bigint NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS province_land_auctions_province_status_idx
  ON province_land_auctions (province_code, status);
CREATE INDEX IF NOT EXISTS province_land_auctions_ends_at_idx
  ON province_land_auctions (ends_at) WHERE status = 'open';

-- Mỗi tỉnh chỉ có tối đa 1 phiên mở tại một thời điểm (tránh lặp lại).
CREATE UNIQUE INDEX IF NOT EXISTS province_land_auctions_one_open_per_province_idx
  ON province_land_auctions (province_code) WHERE status = 'open';

COMMIT;
