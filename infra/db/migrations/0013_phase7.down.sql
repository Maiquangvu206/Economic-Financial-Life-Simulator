-- Down: revert Phase 7 (chính trị)
BEGIN;

DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS candidates;
DROP TABLE IF EXISTS elections;

COMMIT;
