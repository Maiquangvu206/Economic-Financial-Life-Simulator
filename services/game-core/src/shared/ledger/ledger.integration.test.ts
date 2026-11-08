import { describe, expect, it, afterAll, beforeAll } from 'vitest';
import pg, { type PoolClient } from 'pg';
import { ledger } from './ledger.service.js';
import { withTransaction } from '../db/tx.js';

const { Pool } = pg;

/** Integration test cho giao dịch tiền (ledger.transfer + post). Kết nối trực tiếp Postgres. */
const pool = new Pool({
  connectionString: 'postgresql://efls:efls@localhost:55432/efls',
  max: 5,
});

const CHAR_A = '00000000-0000-4000-9000-0000000000d1';
const CHAR_B = '00000000-0000-4000-9000-0000000000d2';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function seedCharacter(db: PoolClient, id: string, cashMinor: number): Promise<void> {
  await db.query(
    `INSERT INTO characters (id, user_id, full_name, age, health_energy, cash_minor, credit_score, heat_level, marital_status, location_x, location_y)
     VALUES ($1::uuid, $2::uuid, $3::text, 18, 100, $4::bigint, 650, 0, 'single', 0, 0)
     ON CONFLICT (id) DO UPDATE SET cash_minor = $4::bigint`,
    [id, SYSTEM_USER_ID, `Test Character ${id.slice(-4)}`, cashMinor],
  );
  await db.query(
    `INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, balance_minor, currency, is_system)
     VALUES (gen_random_uuid(), 'character', $1::uuid, 'cash', $2::bigint, 'VND', false)
     ON CONFLICT (owner_type, owner_id, kind, currency) DO UPDATE SET balance_minor = $2::bigint`,
    [id, cashMinor],
  );
}

async function getCash(db: PoolClient, id: string): Promise<number> {
  const r = await db.query<{ balance_minor: string }>(
    `SELECT balance_minor FROM ledger_accounts WHERE owner_type='character' AND owner_id=$1::uuid AND kind='cash' AND currency='VND'`,
    [id],
  );
  return Number(r.rows[0]?.balance_minor ?? 0);
}

beforeAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedCharacter(client, CHAR_A, 1_000_000_000); // 1 tỷ ₫
    await seedCharacter(client, CHAR_B, 500_000_000); // 500 triệu ₫
    await client.query('COMMIT');
  } finally {
    client.release();
  }
});

afterAll(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM ledger_transactions WHERE reference_type IN ('test_transfer','test_overdraft')`,
    );
    await client.query(
      `DELETE FROM ledger_entries WHERE account_id IN (
        SELECT id FROM ledger_accounts WHERE owner_type='character' AND owner_id IN ($1::uuid, $2::uuid) AND kind='cash' AND currency='VND'
      )`,
      [CHAR_A, CHAR_B],
    );
    await client.query(`DELETE FROM characters WHERE id IN ($1::uuid, $2::uuid)`, [CHAR_A, CHAR_B]);
    await client.query(
      `DELETE FROM ledger_accounts WHERE owner_type='character' AND owner_id IN ($1::uuid, $2::uuid) AND kind='cash' AND currency='VND'`,
      [CHAR_A, CHAR_B],
    );
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  await pool.end();
});

describe('ledger.transfer (transaction tiền)', () => {
  it('chuyển tiền giữa 2 tài khoản và đồng bộ số dư', async () => {
    const amount = 200_000_000; // 200 triệu ₫
    const beforeA = await withTransaction(async (client) => getCash(client, CHAR_A));
    const beforeB = await withTransaction(async (client) => getCash(client, CHAR_B));

    await withTransaction(async (client) => {
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: CHAR_A },
        to: { ownerType: 'character', ownerId: CHAR_B },
        amountMinor: amount,
        kind: 'test_transfer',
        description: 'Test giao dịch tiền giữa 2 nhân vật',
      });
    });

    const afterA = await withTransaction(async (client) => getCash(client, CHAR_A));
    const afterB = await withTransaction(async (client) => getCash(client, CHAR_B));

    expect(afterA).toBe(beforeA - amount);
    expect(afterB).toBe(beforeB + amount);
  });

  it('ném lỗi insufficient_funds khi số dư không đủ', async () => {
    const beforeA = await withTransaction(async (client) => getCash(client, CHAR_A));
    let errCode = '';
    try {
      await withTransaction(async (client) => {
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: CHAR_A },
          to: { ownerType: 'character', ownerId: CHAR_B },
          amountMinor: beforeA + 1, // quá số dư
          kind: 'test_overdraft',
          description: 'Test vượt hạn mức',
        });
      });
    } catch (e: unknown) {
      errCode = (e as { code?: string }).code ?? '';
    }
    expect(errCode).toBe('insufficient_funds');

    // Số dư không thay đổi sau khi giao dịch bị hủy
    const afterA = await withTransaction(async (client) => getCash(client, CHAR_A));
    expect(afterA).toBe(beforeA);
  });
});
