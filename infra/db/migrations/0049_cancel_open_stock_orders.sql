-- 0049: Bỏ lệnh mua/bán đang mở (chuyển sang khớp ngay tại giá thị trường khi bấm).
-- Hoàn tiền escrow cho phần còn lại của lệnh mua đang mở/một phần, sau đó hủy toàn bộ lệnh mở.

-- Đảm bảo tài khoản escrow (cash) tồn tại
INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system, created_at, updated_at)
VALUES (gen_random_uuid(), 'escrow', '00000000-0000-4000-8000-0000000000b4', 'cash', 0, false, now(), now())
ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING;

DO $$
DECLARE
  r RECORD;
  v_remaining bigint;
  v_tx uuid;
  v_char_acct uuid;
  v_escrow_acct uuid;
  v_char_cash bigint;
BEGIN
  SELECT id INTO v_escrow_acct
  FROM ledger_accounts
  WHERE owner_type='escrow' AND owner_id='00000000-0000-4000-8000-0000000000b4' AND kind='cash' AND currency='VND'
  LIMIT 1;

  FOR r IN
    SELECT o.id, o.character_id, (o.amount - o.filled_amount) AS remaining_amount, o.price_minor
    FROM stock_orders o
    WHERE o.side='buy' AND o.status IN ('open','partially_filled') AND (o.amount - o.filled_amount) > 0
  LOOP
    v_remaining := (r.remaining_amount::bigint * r.price_minor::bigint);
    IF v_remaining <= 0 THEN CONTINUE; END IF;

    -- ensure character cash account
    SELECT cash_minor INTO v_char_cash FROM characters WHERE id = r.character_id;
    v_char_cash := COALESCE(v_char_cash, 0);
    INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, is_system, created_at, updated_at)
    VALUES (gen_random_uuid(), 'character', r.character_id, 'cash', v_char_cash, false, now(), now())
    ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING;
    SELECT id INTO v_char_acct
    FROM ledger_accounts
    WHERE owner_type='character' AND owner_id=r.character_id AND kind='cash' AND currency='VND'
    LIMIT 1;

    -- refund escrow -> character (best effort: only if escrow has enough)
    IF EXISTS (SELECT 1 FROM ledger_accounts WHERE id = v_escrow_acct AND balance_minor >= v_remaining) THEN
      v_tx := gen_random_uuid();
      INSERT INTO ledger_transactions (id, kind, description, reference_type, reference_id, created_at)
      VALUES (v_tx, 'order_escrow_refund_migration', 'Hoàn escrow khi chuyển sang khớp lệnh tức thời', 'order', r.id, now());
      UPDATE ledger_accounts SET balance_minor = balance_minor - v_remaining, updated_at = now() WHERE id = v_escrow_acct;
      UPDATE ledger_accounts SET balance_minor = balance_minor + v_remaining, updated_at = now() WHERE id = v_char_acct;
      INSERT INTO ledger_entries (id, transaction_id, account_id, delta_minor, created_at)
      VALUES (gen_random_uuid(), v_tx, v_escrow_acct, -v_remaining, now()),
             (gen_random_uuid(), v_tx, v_char_acct,  v_remaining, now());
      UPDATE characters c
         SET cash_minor = a.balance_minor, updated_at = now()
        FROM ledger_accounts a
       WHERE a.id = v_char_acct AND c.id = r.character_id;
    END IF;
  END LOOP;
END $$;

-- Hủy toàn bộ lệnh đang mở/một phần (mua và bán). Phần bán không giữ tiền, chỉ hủy.
UPDATE stock_orders
   SET status = 'cancelled', updated_at = now()
 WHERE status IN ('open','partially_filled');

INSERT INTO schema_migrations (filename) VALUES ('0049_cancel_open_stock_orders.sql') ON CONFLICT DO NOTHING;
