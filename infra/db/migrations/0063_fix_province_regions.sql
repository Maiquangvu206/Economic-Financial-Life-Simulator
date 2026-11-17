-- Chuẩn hóa vùng miền 3 miền (Bắc/Trung/Nam) cho 34 tỉnh/thành theo danh mục địa lý thống nhất.
-- Sửa Thanh Hóa (038), Nghệ An (040) từ Bắc -> Trung. Hà Tĩnh (042) và Tây Nguyên (052,066,068) giữ/xác nhận Trung.

BEGIN;

UPDATE provinces SET region = 'Trung' WHERE code IN ('038', '040', '042', '052', '066', '068');

COMMIT;
