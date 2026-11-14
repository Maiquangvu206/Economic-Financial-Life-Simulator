BEGIN;
ALTER TABLE stock_holdings ADD COLUMN IF NOT EXISTS avg_cost_minor bigint;
INSERT INTO schema_migrations (filename) VALUES ('0022_stock_holdings_avg_cost.sql')
ON CONFLICT (filename) DO NOTHING;
COMMIT;
