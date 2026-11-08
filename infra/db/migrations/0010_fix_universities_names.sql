-- Phase 4 fix (0010): sửa tên trường đại học bị moji-bake nếu DB đã bị seed
-- bằng pipe PowerShell (non-UTF-8). Idempotent: chạy lại không hại.
-- Áp dụng qua docker cp / psql -f để giữ nguyên byte UTF-8.
BEGIN;
UPDATE universities SET name = 'Đại học Bách Khoa Hà Nội' WHERE degree_code = 'BK_HUST';
UPDATE universities SET name = 'Đại học Kinh tế Quốc dân' WHERE degree_code = 'NEU';
UPDATE universities SET name = 'Đại học Ngoại thương' WHERE degree_code = 'FTU';
UPDATE universities SET name = 'Đại học Luật Hà Nội' WHERE degree_code = 'HLU';
UPDATE universities SET name = 'Đại học Y Dược TP.HCM' WHERE degree_code = 'UMP';
UPDATE universities SET name = 'Đại học Nông Lâm TP.HCM' WHERE degree_code = 'NLU';
COMMIT;
