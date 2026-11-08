-- Down: revert Phase 4 tables (0008_phase4.sql)
BEGIN;

DROP TABLE IF EXISTS business_licenses;
DROP TABLE IF EXISTS skill_progress;
DROP TABLE IF EXISTS tuition_payments;
DROP TABLE IF EXISTS evidences;
DROP TABLE IF EXISTS marriage_contracts;

COMMIT;
