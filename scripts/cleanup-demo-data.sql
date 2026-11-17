-- EFLS Production cleanup: remove demo/test data while keeping root admin access.
-- Keeps: admin@efls.local (active admin) and system@efls.local (NPC/system owner for seeded listings).
-- Removes: all other users/characters and related gameplay/test/runtime data.
-- Resets: mutable economy/state/ownership to clean defaults; preserves config/reference data.

BEGIN;

-- 1) Identify accounts to keep
CREATE TEMP TABLE keep_users (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO keep_users(id)
SELECT id FROM users WHERE email IN ('admin@efls.local', 'system@efls.local');

-- Ensure root admin exists and is active/admin (do not break portal access)
UPDATE users
SET role = 'admin', status = COALESCE(status, 'active')
WHERE email = 'admin@efls.local';
UPDATE users SET status = 'active' WHERE email = 'admin@efls.local' AND (status IS DISTINCT FROM 'active');

CREATE TEMP TABLE keep_characters (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO keep_characters(id)
SELECT c.id FROM characters c WHERE c.user_id IN (SELECT id FROM keep_users);

-- 2) Clear runtime/log/chat/notification/audit-like data (safe to wipe for clean prod start)
DO $$ BEGIN
  IF to_regclass('public.chat_messages') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE chat_messages RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.chat_conversation_reads') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE chat_conversation_reads RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE notifications RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.action_log') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE action_log RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.admin_market_logs') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE admin_market_logs RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.ai_metrics') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ai_metrics RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.outbox_events') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE outbox_events RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.news_items') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE news_items RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.gm_directives') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE gm_directives RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.offline_recaps') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE offline_recaps RESTART IDENTITY CASCADE'; END IF;
END $$;

-- 3) Delete non-kept users/characters with broad dependency cleanup
-- Prefer cascading deletes where FKs cascade; additionally remove from common user/character-owned tables.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Generic cleanup for tables that reference users/characters directly (excluding users/characters themselves)
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('users','characters')
      AND c.column_name IN (
        'user_id','owner_user_id','actor_user_id','sender_user_id','receiver_user_id','target_user_id','created_by','updated_by'
      )
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM %I WHERE %I IS NOT NULL AND %I NOT IN (SELECT id FROM keep_users)', r.table_name, r.column_name, r.column_name);
    EXCEPTION WHEN others THEN
      -- ignore tables/constraints that block this pass
      NULL;
    END;
  END LOOP;

  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('users','characters')
      AND c.column_name IN (
        'character_id','owner_character_id','holder_character_id','sender_character_id','receiver_character_id','target_character_id',
        'candidate_character_id','employee_character_id','plaintiff_character_id','defendant_character_id','buyer_character_id','seller_character_id',
        'bidder_character_id','winner_character_id','heir_character_id','beneficiary_character_id','from_character_id','to_character_id',
        'payer_character_id','payee_character_id','landlord_character_id','tenant_character_id','issuer_character_id'
      )
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM %I WHERE %I IS NOT NULL AND %I NOT IN (SELECT id FROM keep_characters)', r.table_name, r.column_name, r.column_name);
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END $$;

-- 4) Remove non-kept characters and users (final)
DELETE FROM characters WHERE user_id NOT IN (SELECT id FROM keep_users);
DELETE FROM users WHERE id NOT IN (SELECT id FROM keep_users);

-- 5) Reset ownership/state for land/properties to clean unowned defaults
DO $$ BEGIN
  IF to_regclass('public.properties') IS NOT NULL THEN
    -- reset common ownership/listing fields if present
    BEGIN EXECUTE 'UPDATE properties SET owner_character_id = NULL WHERE owner_character_id IS NOT NULL'; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN EXECUTE 'UPDATE properties SET owner_id = NULL WHERE owner_id IS NOT NULL'; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN EXECUTE 'UPDATE properties SET status = ''unowned'' WHERE status IS DISTINCT FROM ''unowned'''; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN EXECUTE 'UPDATE properties SET is_owned = false WHERE is_owned IS DISTINCT FROM false'; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN EXECUTE 'UPDATE properties SET tenant_character_id = NULL WHERE tenant_character_id IS NOT NULL'; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN EXECUTE 'UPDATE properties SET leased_to = NULL WHERE leased_to IS NOT NULL'; EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;

  IF to_regclass('public.province_land_properties') IS NOT NULL THEN
    BEGIN EXECUTE 'UPDATE province_land_properties SET owner_character_id = NULL WHERE owner_character_id IS NOT NULL'; EXCEPTION WHEN undefined_column THEN NULL; END;
    BEGIN EXECUTE 'UPDATE province_land_properties SET status = ''unowned'' WHERE status IS DISTINCT FROM ''unowned'''; EXCEPTION WHEN undefined_column THEN NULL; END;
  END IF;

  IF to_regclass('public.auctions') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE auctions RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.province_land_auctions') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE province_land_auctions RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.property_sale_offers') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE property_sale_offers RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.province_land_purchase_offers') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE province_land_purchase_offers RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.leases') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE leases RESTART IDENTITY CASCADE'; END IF;
END $$;

-- 6) Reset macro economy / game state / state fund to clean start (preserve config tables)
DO $$ BEGIN
  IF to_regclass('public.game_state') IS NOT NULL THEN
    -- Keep row but reset mutable macro/runtime fields where present
    BEGIN EXECUTE $q$UPDATE game_state SET
      macro = jsonb_strip_nulls(COALESCE(macro,'{}'::jsonb) - 'activeEvents' - 'lastRecession' - 'lastWelfare' - 'mayorActionLog'),
      updated_at = now()
    WHERE id = 1$q$; EXCEPTION WHEN others THEN NULL; END;
  END IF;

  IF to_regclass('public.state_fund') IS NOT NULL THEN
    BEGIN EXECUTE 'UPDATE state_fund SET balance_minor = 0, updated_at = now()'; EXCEPTION WHEN undefined_column THEN
      BEGIN EXECUTE 'UPDATE state_fund SET balance = 0'; EXCEPTION WHEN others THEN NULL; END;
    END;
  END IF;

  IF to_regclass('public.state_fund_transactions') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE state_fund_transactions RESTART IDENTITY CASCADE';
  END IF;
END $$;

-- 7) Clear other transactional/test gameplay records that should not carry into production
DO $$ BEGIN
  PERFORM 1;
  -- finance/market/orders/trades/loans/savings/transfers
  IF to_regclass('public.stock_orders') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE stock_orders RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.stock_trades') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE stock_trades RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.stock_holdings') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE stock_holdings RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.loans') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE loans RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.loan_payments') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE loan_payments RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.savings_accounts') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE savings_accounts RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.savings_deposits') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE savings_deposits RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.bank_transfers') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE bank_transfers RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.ledger_entries') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ledger_entries RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.ledger_transactions') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ledger_transactions RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.ledger_accounts') IS NOT NULL THEN
    -- remove non-system/non-kept ledger accounts; keep system/kept if any
    BEGIN
      EXECUTE 'DELETE FROM ledger_accounts WHERE (owner_type = ''character'' AND owner_id NOT IN (SELECT id FROM keep_characters)) OR (owner_type = ''user'' AND owner_id NOT IN (SELECT id FROM keep_users))';
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  -- law/politics/social/family/underworld/etc.
  IF to_regclass('public.court_cases') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE court_cases RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.criminal_records') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE criminal_records RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.votes') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE votes RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.candidates') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE candidates RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.elections') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE elections RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.marriage_contracts') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE marriage_contracts RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.marriage_proposals') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE marriage_proposals RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.divorce_proposals') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE divorce_proposals RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.divorce_proposal_snapshots') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE divorce_proposal_snapshots RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.wills') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE wills RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.will_heirs') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE will_heirs RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.will_beneficiaries') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE will_beneficiaries RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.trust_funds') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE trust_funds RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.trust_fund_beneficiaries') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE trust_fund_beneficiaries RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.inheritance_settlements') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE inheritance_settlements RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.unclaimed_estate_assets') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE unclaimed_estate_assets RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.underworld_evidences') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE underworld_evidences RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.blackmail_contracts') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE blackmail_contracts RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.sting_operations') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE sting_operations RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.police_sweeps') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE police_sweeps RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.heat_events') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE heat_events RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.fake_credentials') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE fake_credentials RESTART IDENTITY CASCADE'; END IF;

  -- education/employment progression tied to deleted test chars (config tables like universities/jobs kept)
  IF to_regclass('public.degrees') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE degrees RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.skill_progress') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE skill_progress RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.education_early_grad_tests') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE education_early_grad_tests RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.tuition_payments') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE tuition_payments RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.employments') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE employments RESTART IDENTITY CASCADE'; END IF;

  -- tax/business runtime
  IF to_regclass('public.tax_assessments') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE tax_assessments RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.tax_audits') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE tax_audits RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.company_tax_filings') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE company_tax_filings RESTART IDENTITY CASCADE'; END IF;
  IF to_regclass('public.business_licenses') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE business_licenses RESTART IDENTITY CASCADE'; END IF;
END $$;

COMMIT;

-- Sanity checks (informational)
SELECT email, username, role, status FROM users ORDER BY email;
SELECT count(*) AS remaining_users FROM users;
SELECT count(*) AS remaining_characters FROM characters;