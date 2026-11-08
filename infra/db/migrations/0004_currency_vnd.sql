-- Chuẩn hoá tiền tệ về VNĐ (đồng) cho toàn bộ sổ cái.
-- An toàn khi chạy lại nhiều lần và không phá vỡ ràng buộc UNIQUE.

ALTER TABLE ledger_accounts ALTER COLUMN currency SET DEFAULT 'VND';

-- Chỉ đổi những tài khoản chưa có bản ghi VND tương ứng để tránh vi phạm UNIQUE.
UPDATE ledger_accounts AS a
SET currency = 'VND'
WHERE a.currency = 'USD'
  AND NOT EXISTS (
    SELECT 1
    FROM ledger_accounts AS b
    WHERE b.owner_type = a.owner_type
      AND b.owner_id = a.owner_id
      AND b.kind = a.kind
      AND b.currency = 'VND'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ledger_accounts_currency_check'
  ) THEN
    ALTER TABLE ledger_accounts
      ADD CONSTRAINT ledger_accounts_currency_check CHECK (currency IN ('VND', 'USD'));
  END IF;
END $$;
