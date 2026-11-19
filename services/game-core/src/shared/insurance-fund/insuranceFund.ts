import type { Db } from '../db/tx.js';
import { pool } from '../db/pool.js';
import { ledger, SYSTEM_BANK_ID, SYSTEM_GOVERNMENT_ID, type LedgerOwnerType } from '../ledger/ledger.service.js';

export type InsuranceFundActorType = 'system' | 'admin' | 'character';

export interface InsuranceFundTxInput {
  amountMinor: number; // + inflow to fund, - outflow from fund
  reasonCode: string;
  description?: string;
  refType?: string;
  refId?: string;
  actorType: InsuranceFundActorType;
  actorId?: string | null;
  meta?: Record<string, unknown>;
}

export interface FundLedgerParty {
  ownerType: LedgerOwnerType;
  ownerId: string;
  kind?: 'cash' | 'savings' | 'escrow' | 'clearing';
}

async function ensureRow(db: Db): Promise<void> {
  await db.query(
    `INSERT INTO insurance_fund (id, balance_minor) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
  );
}

async function lockBalance(db: Db): Promise<number> {
  await ensureRow(db);
  const r = await db.query<{ balance_minor: string }>(
    `SELECT balance_minor FROM insurance_fund WHERE id = 1 FOR UPDATE`,
  );
  return Number(r.rows[0]?.balance_minor ?? 0);
}

export async function getInsuranceFundBalance(db: Db = pool): Promise<number> {
  await ensureRow(db);
  const r = await db.query<{ balance_minor: string }>(`SELECT balance_minor FROM insurance_fund WHERE id = 1`);
  return Number(r.rows[0]?.balance_minor ?? 0);
}

export async function creditInsuranceFund(
  db: Db,
  from: FundLedgerParty,
  amountMinor: number,
  input: InsuranceFundTxInput & { ledgerKind?: string; ledgerDescription?: string },
): Promise<number> {
  if (amountMinor <= 0) return lockBalance(db);
  const before = await lockBalance(db);
  const next = before + amountMinor;
  await db.query(
    `UPDATE insurance_fund SET balance_minor = $1, updated_at = now() WHERE id = 1`,
    [next],
  );
  await db.query(
    `INSERT INTO insurance_fund_transactions
       (amount_minor, reason_code, description, ref_type, ref_id, actor_type, actor_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      amountMinor,
      input.reasonCode,
      input.description ?? null,
      input.refType ?? null,
      input.refId ?? null,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );

  // Ledger mirror: payer -> SYSTEM_BANK (insurance fund holding). Best-effort if ledger schema absent.
  try {
    await ledger.transfer(db as any, {
      from: { ownerType: from.ownerType, ownerId: from.ownerId, kind: from.kind ?? 'cash' },
      to: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID, kind: 'cash' },
      amountMinor,
      kind: input.ledgerKind ?? input.reasonCode,
      description: input.ledgerDescription ?? input.description ?? `Insurance fund credit: ${input.reasonCode}`,
      referenceType: input.refType,
      referenceId: input.refId,
    });
  } catch {
    // ignore if ledger not ready in this environment
  }
  return next;
}

export async function debitInsuranceFund(
  db: Db,
  to: FundLedgerParty,
  amountMinor: number,
  input: InsuranceFundTxInput & { ledgerKind?: string; ledgerDescription?: string },
): Promise<number> {
  if (amountMinor <= 0) return lockBalance(db);
  const before = await lockBalance(db);
  if (before < amountMinor) {
    throw new Error('INSURANCE_FUND_INSUFFICIENT');
  }
  const next = before - amountMinor;
  await db.query(
    `UPDATE insurance_fund SET balance_minor = $1, updated_at = now() WHERE id = 1`,
    [next],
  );
  await db.query(
    `INSERT INTO insurance_fund_transactions
       (amount_minor, reason_code, description, ref_type, ref_id, actor_type, actor_id, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      -amountMinor,
      input.reasonCode,
      input.description ?? null,
      input.refType ?? null,
      input.refId ?? null,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );

  try {
    await ledger.transfer(db as any, {
      from: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID, kind: 'cash' },
      to: { ownerType: to.ownerType, ownerId: to.ownerId, kind: to.kind ?? 'cash' },
      amountMinor,
      kind: input.ledgerKind ?? input.reasonCode,
      description: input.ledgerDescription ?? input.description ?? `Insurance fund debit: ${input.reasonCode}`,
      referenceType: input.refType,
      referenceId: input.refId,
    });
  } catch {
    // ignore
  }
  return next;
}
