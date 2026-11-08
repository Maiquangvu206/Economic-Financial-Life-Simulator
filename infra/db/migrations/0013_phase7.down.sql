-- Down: revert Phase 7 tables (0013_phase7.sql)
BEGIN;

DROP TABLE IF EXISTS spatial_presences;
DROP TABLE IF EXISTS spatial_sessions;
DROP TABLE IF EXISTS cross_server_listings;
DROP TABLE IF EXISTS futures_contracts;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS candidates;
DROP TABLE IF EXISTS elections;

COMMIT;
