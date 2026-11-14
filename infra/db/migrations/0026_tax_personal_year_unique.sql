-- 0026: Đảm bảo mỗi nhân vật chỉ có 1 quyết toán thuế cá nhân/năm (không gộp doanh nghiệp)
BEGIN;

-- Gộp bản ghi trùng lịch sử (giữ bản đã nộp mới nhất, nếu không có thì bản mới nhất)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY character_id, tax_year
           ORDER BY (status = 'paid') DESC,
                    COALESCE(paid_at, created_at) DESC,
                    created_at DESC,
                    id DESC
         ) AS rn
  FROM tax_assessments
  WHERE character_id IS NOT NULL AND company_id IS NULL
)
DELETE FROM tax_assessments t
USING ranked r
WHERE t.id = r.id AND r.rn > 1;

-- Ràng buộc: 1 assessment thuế cá nhân cho mỗi (character_id, tax_year)
CREATE UNIQUE INDEX IF NOT EXISTS tax_assessments_personal_year_uniq
  ON tax_assessments (character_id, tax_year)
  WHERE character_id IS NOT NULL AND company_id IS NULL;

COMMIT;
