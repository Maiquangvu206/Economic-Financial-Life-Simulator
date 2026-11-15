-- 0040_map_province_land_prices.sql
-- Lưu cấu hình giá đất (land price config) theo từng tỉnh/thành cho bản đồ sinh động.
-- Cho phép admin cấu hình/lưu giá đất cho mọi tỉnh (không chỉ 001), không phụ thuộc hiển thị bản đồ.
-- Forward-only, idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS map_province_meta (
  province_code text PRIMARY KEY,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS map_province_land_prices (
  province_code text NOT NULL,
  x integer NOT NULL CHECK (x >= 0),
  y integer NOT NULL CHECK (y >= 0),
  land_price_minor bigint NOT NULL DEFAULT 0 CHECK (land_price_minor >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (province_code, x, y)
);

CREATE INDEX IF NOT EXISTS map_province_land_prices_province_idx
  ON map_province_land_prices (province_code);

COMMIT;
