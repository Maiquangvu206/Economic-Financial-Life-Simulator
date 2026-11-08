-- Down: revert Phase 5 tables (0011_phase5.sql)
BEGIN;

DROP TABLE IF EXISTS police_sweeps;
DROP TABLE IF EXISTS insurance_policies;
DROP TABLE IF EXISTS sting_operations;
DROP TABLE IF EXISTS underworld_evidences;

COMMIT;
