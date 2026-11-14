BEGIN;
-- down: không ép NOT NULL lại để tránh lỗi dữ liệu; chỉ gỡ ghi nhận migration
DELETE FROM schema_migrations WHERE filename = '0023_stock_trades_nullable.sql';
COMMIT;
