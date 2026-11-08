-- Down: Revert auctions table (0007_auctions.sql)
BEGIN;

DROP TABLE IF EXISTS auctions;

COMMIT;
