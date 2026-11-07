-- Remove seeded starter content. Leaves schema intact.
BEGIN;

DELETE FROM company_shareholders;
DELETE FROM stock_tickers;
DELETE FROM companies
  WHERE owner_character_id = '00000000-0000-4000-8000-0000000000c1';
DELETE FROM logistics_nodes;
DELETE FROM properties;
DELETE FROM map_nodes;
DELETE FROM jobs;
DELETE FROM universities;
DELETE FROM ledger_accounts
  WHERE owner_type = 'character' AND owner_id = '00000000-0000-4000-8000-0000000000c1';
DELETE FROM characters WHERE id = '00000000-0000-4000-8000-0000000000c1';
DELETE FROM users WHERE id = '00000000-0000-4000-8000-000000000001';

COMMIT;
