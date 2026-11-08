-- Down: khôi phục 34 tỉnh mã 001-034 (bản 0015). Lưu ý không đảo được CCCD đã remap.
BEGIN;

TRUNCATE provinces;
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
  ('034', 'Sóc Trăng', 'Nam', false);

COMMIT;
