-- Phase 2: Đấu giá tài sản phát mại (Auctions)
--
-- Bảng auctions quản lý phiên đấu giá công khai cho bất động sản nợ xấu /
-- tài sản phát mại. Mỗi phiên có thời gian kết thúc, giá khởi điểm và mức
-- giá cao nhất hiện tại.

BEGIN;

CREATE TABLE IF NOT EXISTS auctions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id           uuid NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  seller_character_id   uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  starting_price_minor  bigint NOT NULL CHECK (starting_price_minor > 0),
  current_bid_minor     bigint NOT NULL CHECK (current_bid_minor >= 0),
  highest_bidder_id     uuid REFERENCES characters (id) ON DELETE SET NULL,
  ends_at               timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'ended', 'cancelled')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auctions_property_idx
  ON auctions (property_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS auctions_ends_at_idx
  ON auctions (ends_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS auctions_status_idx
  ON auctions (status);

COMMIT;
