import type { Db } from '../db/tx.js';
import { pool } from '../db/pool.js';
import { ledger, SYSTEM_BANK_ID, SYSTEM_GOVERNMENT_ID, type LedgerOwnerType } from '../ledger/ledger.service.js';

export type StateFundActorType = 'system' | 'admin' | 'mayor' | 'character';

export interface StateFundTxInput {
  amountMinor: number; // + inflow to fund, - outflow from fund
  reasonCode: string;
  description?: string;
  refType?: string;
  refId?: string;
  actorType: StateFundActorType;
  actorId?: string | null;
  meta?: Record<string, unknown>;
}

export interface StateFundLedgerParty {
  ownerType: LedgerOwnerType;
  ownerId: string;
  kind?: 'cash' | 'savings' | 'escrow' | 'clearing';
}

export const STATE_FUND_GOV_KIND = 'cash' as const;

async function ensureRow(db: Db): Promise<void> {
  await db.query(
    `INSERT INTO state_fund (id, balance_minor) VALUES (1, 0) ON CONFLICT (id) DO NOTHING`,
  );
}

async function lockBalance(db: Db): Promise<number> {
  await ensureRow(db);
  const r = await db.query<{ balance_minor: string }>(
    `SELECT balance_minor FROM state_fund WHERE id = 1 FOR UPDATE`,
  );
  return Number(r.rows[0]?.balance_minor ?? 0);
}

export async function getStateFundBalance(db: Db = pool): Promise<number> {
  await ensureRow(db);
  const r = await db.query<{ balance_minor: string }>(`SELECT balance_minor FROM state_fund WHERE id = 1`);
  return Number(r.rows[0]?.balance_minor ?? 0);
}

async function applyBalanceDelta(db: Db, deltaMinor: number, input: StateFundTxInput): Promise<number> {
  const current = await lockBalance(db);
  const next = current + deltaMinor;
  if (next < 0) {
    throw new Error('STATE_FUND_INSUFFICIENT');
  }
  await db.query(`UPDATE state_fund SET balance_minor = $1, updated_at = now() WHERE id = 1`, [next]);
  await db.query(
    `INSERT INTO state_fund_transactions
      (id, amount_minor, balance_after, reason_code, description, ref_type, ref_id, actor_type, actor_id, meta)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
    [
      deltaMinor,
      next,
      input.reasonCode,
      input.description ?? null,
      input.refType ?? null,
      input.refId ?? null,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );
  return next;
}

/** Credit fund from an external party (party pays into national fund). */
export async function creditStateFund(
  client: any,
  party: StateFundLedgerParty,
  amountMinor: number,
  input: StateFundTxInput & { ledgerKind?: string; ledgerDescription?: string },
): Promise<string> {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw new Error('INVALID_AMOUNT');
  await ledger.transfer(client, {
    from: { ownerType: party.ownerType, ownerId: party.ownerId, kind: party.kind ?? 'cash' },
    to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: STATE_FUND_GOV_KIND },
    amountMinor,
    kind: input.ledgerKind ?? input.reasonCode,
    description: input.ledgerDescription ?? input.description ?? input.reasonCode,
    referenceType: input.refType,
    referenceId: input.refId,
  });
  await applyBalanceDelta(client, amountMinor, input);
  return String(amountMinor);
}

/** Debit fund to an external party (national fund pays out). */
export async function debitStateFund(
  client: any,
  party: StateFundLedgerParty,
  amountMinor: number,
  input: StateFundTxInput & { ledgerKind?: string; ledgerDescription?: string },
): Promise<string> {
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw new Error('INVALID_AMOUNT');
  await ledger.transfer(client, {
    from: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: STATE_FUND_GOV_KIND },
    to: { ownerType: party.ownerType, ownerId: party.ownerId, kind: party.kind ?? 'cash' },
    amountMinor,
    kind: input.ledgerKind ?? input.reasonCode,
    description: input.ledgerDescription ?? input.description ?? input.reasonCode,
    referenceType: input.refType,
    referenceId: input.refId,
  });
  await applyBalanceDelta(client, -amountMinor, input);
  return String(amountMinor);
}

/** Admin adjustment: delta can be + or -; balanced against system bank in ledger. */
export async function adjustStateFund(
  client: any,
  deltaMinor: number,
  input: StateFundTxInput & { ledgerKind?: string; ledgerDescription?: string },
): Promise<number> {
  if (!Number.isFinite(deltaMinor) || deltaMinor === 0) throw new Error('INVALID_AMOUNT');
  const amount = Math.abs(deltaMinor);
  if (deltaMinor > 0) {
    await ledger.transfer(client, {
      from: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID, kind: 'cash' },
      to: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: STATE_FUND_GOV_KIND },
      amountMinor: amount,
      kind: input.ledgerKind ?? 'state_fund_adjust',
      description: input.ledgerDescription ?? input.description ?? 'Admin điều chỉnh quỹ đất nước (tăng)',
      referenceType: input.refType,
      referenceId: input.refId,
    });
  } else {
    await ledger.transfer(client, {
      from: { ownerType: 'government', ownerId: SYSTEM_GOVERNMENT_ID, kind: STATE_FUND_GOV_KIND },
      to: { ownerType: 'bank', ownerId: SYSTEM_BANK_ID, kind: 'cash' },
      amountMinor: amount,
      kind: input.ledgerKind ?? 'state_fund_adjust',
      description: input.ledgerDescription ?? input.description ?? 'Admin điều chỉnh quỹ đất nước (giảm)',
      referenceType: input.refType,
      referenceId: input.refId,
    });
  }
  return applyBalanceDelta(client, deltaMinor, input);
}
