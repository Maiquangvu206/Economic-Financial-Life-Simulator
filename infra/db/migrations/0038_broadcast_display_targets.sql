-- Thêm tùy chọn vị trí hiển thị thông báo hệ thống (trang đăng nhập/home vs trong ứng dụng người dùng)

ALTER TABLE system_broadcasts
  ADD COLUMN IF NOT EXISTS show_on_login boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_in_app boolean NOT NULL DEFAULT true;

-- Bản ghi cũ: giữ hiển thị trong ứng dụng như trước
UPDATE system_broadcasts
SET show_in_app = COALESCE(show_in_app, true),
    show_on_login = COALESCE(show_on_login, false)
WHERE show_in_app IS NULL OR show_on_login IS NULL;
