-- Phase 8 fix: đổi mã tỉnh sang mã chính thức 34 tỉnh/thành (2025).
-- Thứ tự an toàn: (1) chèn tỉnh mới, (2) remap characters, (3) xóa mã cũ.

BEGIN;

-- 1) Chèn 34 tỉnh/thành chính thức (upsert)
INSERT INTO provinces (code, name, region, is_city) VALUES
  ('001', 'Thành phố Hà Nội', 'Bắc', true),
  ('004', 'Tỉnh Cao Bằng', 'Bắc', false),
  ('008', 'Tỉnh Tuyên Quang', 'Bắc', false),
  ('011', 'Tỉnh Điện Biên', 'Bắc', false),
  ('012', 'Tỉnh Lai Châu', 'Bắc', false),
  ('014', 'Tỉnh Sơn La', 'Bắc', false),
  ('015', 'Tỉnh Lào Cai', 'Bắc', false),
  ('019', 'Tỉnh Thái Nguyên', 'Bắc', false),
  ('020', 'Tỉnh Lạng Sơn', 'Bắc', false),
  ('022', 'Tỉnh Quảng Ninh', 'Bắc', false),
  ('024', 'Tỉnh Bắc Ninh', 'Bắc', false),
  ('025', 'Tỉnh Phú Thọ', 'Bắc', false),
  ('031', 'Thành phố Hải Phòng', 'Bắc', true),
  ('033', 'Tỉnh Hưng Yên', 'Bắc', false),
  ('037', 'Tỉnh Ninh Bình', 'Bắc', false),
  ('038', 'Tỉnh Thanh Hóa', 'Bắc', false),
  ('040', 'Tỉnh Nghệ An', 'Bắc', false),
  ('042', 'Tỉnh Hà Tĩnh', 'Trung', false),
  ('044', 'Tỉnh Quảng Trị', 'Trung', false),
  ('046', 'Thành phố Huế', 'Trung', true),
  ('048', 'Thành phố Đà Nẵng', 'Trung', true),
  ('051', 'Tỉnh Quảng Ngãi', 'Trung', false),
  ('052', 'Tỉnh Gia Lai', 'Trung', false),
  ('056', 'Tỉnh Khánh Hòa', 'Trung', false),
  ('066', 'Tỉnh Đắk Lắk', 'Trung', false),
  ('068', 'Tỉnh Lâm Đồng', 'Trung', false),
  ('075', 'Tỉnh Đồng Nai', 'Nam', false),
  ('079', 'Thành phố Hồ Chí Minh', 'Nam', true),
  ('080', 'Tỉnh Tây Ninh', 'Nam', false),
  ('082', 'Tỉnh Đồng Tháp', 'Nam', false),
  ('086', 'Tỉnh Vĩnh Long', 'Nam', false),
  ('091', 'Tỉnh An Giang', 'Nam', false),
  ('092', 'Thành phố Cần Thơ', 'Nam', true),
  ('096', 'Tỉnh Cà Mau', 'Nam', false)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, region = EXCLUDED.region, is_city = EXCLUDED.is_city;

-- 2) Remap nơi sinh + CCCD cho nhân vật cũ
DO $$
DECLARE r RECORD;
  new_code text;
  candidate text;
BEGIN
  FOR r IN SELECT id, birthplace, cccd FROM characters WHERE birthplace IS NOT NULL LOOP
    new_code := CASE r.birthplace
      WHEN '001' THEN '001'  -- Hà Nội
      WHEN '002' THEN '031'  -- Hải Phòng
      WHEN '003' THEN '046'  -- Huế
      WHEN '004' THEN '048'  -- Đà Nẵng
      WHEN '005' THEN '092'  -- Cần Thơ
      WHEN '006' THEN '079'  -- Hồ Chí Minh
      WHEN '007' THEN '022'  -- Quảng Ninh
      WHEN '008' THEN '024'  -- Bắc Ninh
      WHEN '009' THEN '019'  -- Thái Nguyên
      WHEN '010' THEN '014'  -- Sơn La
      WHEN '011' THEN '012'  -- Lai Châu
      WHEN '012' THEN '011'  -- Điện Biên
      WHEN '013' THEN '015'  -- Lào Cai
      WHEN '014' THEN '008'  -- Tuyên Quang
      WHEN '015' THEN '020'  -- Lạng Sơn
      WHEN '016' THEN '004'  -- Cao Bằng
      WHEN '017' THEN '025'  -- Phú Thọ
      WHEN '018' THEN '033'  -- Hưng Yên
      WHEN '019' THEN '024'  -- Bắc Giang (sáp nhập vào Bắc Ninh)
      WHEN '020' THEN '038'  -- Thanh Hóa
      WHEN '021' THEN '040'  -- Nghệ An
      WHEN '022' THEN '042'  -- Hà Tĩnh
      WHEN '023' THEN '044'  -- Quảng Bình (sáp nhập vào Quảng Trị)
      WHEN '024' THEN '044'  -- Quảng Trị
      WHEN '025' THEN '048'  -- Quảng Nam (sáp nhập vào Đà Nẵng)
      WHEN '026' THEN '051'  -- Quảng Ngãi
      WHEN '027' THEN '052'  -- Gia Lai
      WHEN '028' THEN '066'  -- Đắk Lắk
      WHEN '029' THEN '056'  -- Khánh Hòa
      WHEN '030' THEN '068'  -- Lâm Đồng
      WHEN '031' THEN '080'  -- Tây Ninh
      WHEN '032' THEN '091'  -- An Giang
      WHEN '033' THEN '096'  -- Cà Mau
      WHEN '034' THEN '092'  -- Sóc Trăng (sáp nhập vào Cần Thơ)
      ELSE NULL
    END;
    -- Mã mới không đặt lại (đã đúng chuẩn) thì bỏ qua
    IF new_code IS NOT NULL AND new_code <> r.birthplace THEN
      candidate := NULL;
      IF r.cccd IS NOT NULL AND length(r.cccd) = 12 THEN
        candidate := new_code || substr(r.cccd, 4);
        IF EXISTS (SELECT 1 FROM characters WHERE cccd = candidate AND id <> r.id) THEN
          candidate := new_code || lpad((floor(random() * 1000000000))::text, 9, '0');
        END IF;
      END IF;
      UPDATE characters SET birthplace = new_code, cccd = COALESCE(candidate, cccd)
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 3) Xóa mã tỉnh cũ (002, 003, ...) không thuộc 34 mã mới
DELETE FROM provinces WHERE code NOT IN (
  '001','004','008','011','012','014','015','019','020','022','024','025','031','033',
  '037','038','040','042','044','046','048','051','052','056','066','068','075','079',
  '080','082','086','091','092','096'
);

COMMIT;
