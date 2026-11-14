-- down 0026
BEGIN;
DROP INDEX IF EXISTS tax_assessments_personal_year_uniq;
COMMIT;
