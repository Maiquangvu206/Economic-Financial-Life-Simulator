BEGIN;
ALTER TABLE stock_holdings DROP COLUMN IF EXISTS avg_cost_minor;
DELETE FROM schema_migrations WHERE filename = '0022_stock_holdings_avg_cost.sql';
COMMIT;
