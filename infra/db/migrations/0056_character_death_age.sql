-- 0056: Cấu hình tuổi thọ tối đa (death_age) cho từng nhân vật (admin thiết lập).
-- Khi tuổi >= death_age, nhân vật chết và chuyển sang luồng kế thừa. Idempotent, forward-only.
BEGIN;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS death_age integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'characters_death_age_check') THEN
    ALTER TABLE characters
      ADD CONSTRAINT characters_death_age_check CHECK (death_age IS NULL OR (death_age >= 1 AND death_age <= 200));
  END IF;
END $$;

INSERT INTO schema_migrations (filename) VALUES ('0056_character_death_age.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
