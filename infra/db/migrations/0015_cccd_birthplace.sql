-- Phase 8: CCCD kiểu Việt Nam + Nơi sinh 34 tỉnh/thành
--
-- - characters.cccd: 12 chữ số, 3 số đầu là mã tỉnh (001-034), unique
-- - characters.birthplace: mã tỉnh nơi sinh (nullable cho tài khoản cũ)
-- - provinces: 34 tỉnh/thành trực thuộc TW & tỉnh (2025)

BEGIN;

CREATE TABLE IF NOT EXISTS provinces (
  code     text PRIMARY KEY CHECK (char_length(code) = 3),
  name     text NOT NULL,
  region   text NOT NULL CHECK (region IN ('Bắc', 'Trung', 'Nam')),
  is_city  boolean NOT NULL DEFAULT false
);

INSERT INTO provinces (code, name, region, is_city) VALUES
  ('001', 'Hà Nội', 'Bắc', true),
  ('002', 'Hải Phòng', 'Bắc', true),
  ('003', 'Huế', 'Trung', true),
  ('004', 'Đà Nẵng', 'Trung', true),
  ('005', 'Cần Thơ', 'Nam', true),
  ('006', 'Hồ Chí Minh', 'Nam', true),
  ('007', 'Quảng Ninh', 'Bắc', false),
  ('008', 'Bắc Ninh', 'Bắc', false),
  ('009', 'Thái Nguyên', 'Bắc', false),
  ('010', 'Sơn La', 'Bắc', false),
  ('011', 'Lai Châu', 'Bắc', false),
  ('012', 'Điện Biên', 'Bắc', false),
  ('013', 'Lào Cai', 'Bắc', false),
  ('014', 'Tuyên Quang', 'Bắc', false),
  ('015', 'Lạng Sơn', 'Bắc', false),
  ('016', 'Cao Bằng', 'Bắc', false),
  ('017', 'Phú Thọ', 'Bắc', false),
  ('018', 'Hưng Yên', 'Bắc', false),
  ('019', 'Bắc Giang', 'Bắc', false),
  ('020', 'Thanh Hóa', 'Bắc', false),
  ('021', 'Nghệ An', 'Bắc', false),
  ('022', 'Hà Tĩnh', 'Trung', false),
  ('023', 'Quảng Bình', 'Trung', false),
  ('024', 'Quảng Trị', 'Trung', false),
  ('025', 'Quảng Nam', 'Trung', false),
  ('026', 'Quảng Ngãi', 'Trung', false),
  ('027', 'Gia Lai', 'Trung', false),
  ('028', 'Đắk Lắk', 'Trung', false),
  ('029', 'Khánh Hòa', 'Trung', false),
  ('030', 'Lâm Đồng', 'Trung', false),
  ('031', 'Tây Ninh', 'Nam', false),
  ('032', 'An Giang', 'Nam', false),
  ('033', 'Cà Mau', 'Nam', false),
  ('034', 'Sóc Trăng', 'Nam', false)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS cccd char(12);
ALTER TABLE characters ADD COLUMN IF NOT EXISTS birthplace text
  REFERENCES provinces (code) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS characters_cccd_uidx
  ON characters (cccd) WHERE cccd IS NOT NULL;

COMMIT;
