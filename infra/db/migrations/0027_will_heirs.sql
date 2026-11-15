-- 0027: Di chúc nhiều người thừa kế với tỉ lệ phân chia
BEGIN;

CREATE TABLE IF NOT EXISTS will_heirs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  will_id uuid NOT NULL REFERENCES wills (id) ON DELETE CASCADE,
  heir_character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  share_pct numeric(5,2) NOT NULL CHECK (share_pct > 0 AND share_pct <= 100),
  relationship text NOT NULL DEFAULT 'Người thừa kế',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT will_heirs_unique UNIQUE (will_id, heir_character_id)
);

CREATE INDEX IF NOT EXISTS will_heirs_will_idx ON will_heirs (will_id);

-- Chuyển người thừa kế chính hiện có thành 1 mục thừa kế 100% (nếu có)
INSERT INTO will_heirs (will_id, heir_character_id, share_pct, relationship)
SELECT w.id, w.primary_heir_id, 100.00, 'Người thừa kế chính'
FROM wills w
WHERE w.primary_heir_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM will_heirs wh WHERE wh.will_id = w.id AND wh.heir_character_id = w.primary_heir_id
  );

COMMIT;
