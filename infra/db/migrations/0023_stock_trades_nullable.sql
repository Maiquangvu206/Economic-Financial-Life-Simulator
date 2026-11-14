BEGIN;
ALTER TABLE stock_trades
  ALTER COLUMN buy_order_id DROP NOT NULL,
  ALTER COLUMN sell_order_id DROP NOT NULL,
  ALTER COLUMN buyer_character_id DROP NOT NULL,
  ALTER COLUMN seller_character_id DROP NOT NULL;
INSERT INTO schema_migrations (filename) VALUES ('0023_stock_trades_nullable.sql')
ON CONFLICT (filename) DO NOTHING;
COMMIT;
