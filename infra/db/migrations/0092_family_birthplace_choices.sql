-- 0092_family_birthplace_choices.sql
-- Cho phép chọn nơi sinh khi sinh con (thai kỳ) và khi nhận con nuôi.

BEGIN;

ALTER TABLE birth_proposals
  ADD COLUMN IF NOT EXISTS planned_birthplace text REFERENCES provinces(code);

ALTER TABLE pregnancies
  ADD COLUMN IF NOT EXISTS planned_birthplace text REFERENCES provinces(code);

ALTER TABLE adoption_applications
  ADD COLUMN IF NOT EXISTS preferred_birthplace text REFERENCES provinces(code);

INSERT INTO schema_migrations (filename) VALUES ('0092_family_birthplace_choices.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
