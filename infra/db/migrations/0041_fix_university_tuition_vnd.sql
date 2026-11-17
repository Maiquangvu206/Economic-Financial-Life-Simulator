-- 0041_fix_university_tuition_vnd.sql
-- Sửa học phí đại học (VNĐ/tháng) bị seed nhầm đơn vị (500M/tháng -> mức hợp lý).
BEGIN;

UPDATE universities SET tuition_minor = 5000000 WHERE degree_code = 'BK_HUST' AND tuition_minor = 500000000;
UPDATE universities SET tuition_minor = 4000000 WHERE degree_code = 'NEU'     AND tuition_minor = 400000000;
UPDATE universities SET tuition_minor = 3500000 WHERE degree_code = 'HLU'     AND tuition_minor = 350000000;
UPDATE universities SET tuition_minor = 4500000 WHERE degree_code = 'FTU'     AND tuition_minor = 450000000;
UPDATE universities SET tuition_minor = 3000000 WHERE degree_code = 'NLU'     AND tuition_minor = 300000000;
UPDATE universities SET tuition_minor = 6000000 WHERE degree_code = 'UMP'     AND tuition_minor = 600000000;

COMMIT;