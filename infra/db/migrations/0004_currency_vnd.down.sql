ALTER TABLE ledger_accounts ALTER COLUMN currency SET DEFAULT 'USD';

ALTER TABLE ledger_accounts DROP CONSTRAINT IF EXISTS ledger_accounts_currency_check;
