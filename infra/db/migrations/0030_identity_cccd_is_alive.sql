-- 0030: CCCD chuẩn hóa & trạng thái sống/chết (Pha 1/2 nền tảng)
BEGIN;

ALTER TABLE characters
  ADD COLUMN IF NOT EXISTS is_alive boolean NOT NULL DEFAULT true;

-- Backfill CCCD 12 số duy nhất cho dữ liệu hiện có (giữ nguyên nếu đã hợp lệ)
DO $$
DECLARE
  r RECORD;
  base_prefix text;
  candidate text;
  seq int := 0;
BEGIN
  -- đảm bảo các cccd hiện có không trùng; nếu trùng hiếm gặp thì null hóa bản sau để cấp lại
  -- (sẽ được cấp lại bên dưới)
  FOR r IN
    SELECT id, cccd, birthplace
    FROM characters
    WHERE cccd IS NULL OR length(cccd) <> 12 OR cccd !~ '^\d{12}$'
    ORDER BY created_at, id
  LOOP
    base_prefix := COALESCE(NULLIF(substr(r.birthplace,1,3),''), '001');
    IF base_prefix !~ '^\d{3}$' THEN base_prefix := '001'; END IF;
    LOOP
      seq := seq + 1;
      candidate := base_prefix || lpad((seq % 1000000000)::text, 9, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM characters c WHERE c.cccd = candidate AND c.id <> r.id);
    END LOOP;
    UPDATE characters SET cccd = candidate WHERE id = r.id AND (cccd IS NULL OR length(cccd) <> 12 OR cccd !~ '^\d{12}$' OR EXISTS (SELECT 1 FROM characters c2 WHERE c2.cccd = characters.cccd AND c2.id <> characters.id));
  END LOOP;

  -- xử lý trùng lặp còn sót (nếu có)
  FOR r IN
    SELECT id FROM (
      SELECT id, cccd, row_number() OVER (PARTITION BY cccd ORDER BY created_at, id) rn
      FROM characters WHERE cccd IS NOT NULL
    ) t WHERE t.rn > 1
  LOOP
    base_prefix := '001';
    LOOP
      seq := seq + 1;
      candidate := base_prefix || lpad((seq % 1000000000)::text, 9, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM characters c WHERE c.cccd = candidate);
    END LOOP;
    UPDATE characters SET cccd = candidate WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE characters
  ALTER COLUMN cccd SET NOT NULL;

-- đảm bảo unique (thay index cũ nếu có)
DROP INDEX IF EXISTS characters_cccd_uidx;
ALTER TABLE characters
  DROP CONSTRAINT IF EXISTS characters_cccd_key,
  ADD CONSTRAINT characters_cccd_key UNIQUE (cccd);

CREATE INDEX IF NOT EXISTS characters_alive_idx ON characters (is_alive);

COMMIT;
