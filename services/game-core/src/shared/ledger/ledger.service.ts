import type { PoolClient } from 'pg';
import { AppError } from '../http/errors.js';
import type { Db } from '../db/tx.js';

export type LedgerOwnerType = 'character' | 'company' | 'bank' | 'government' | 'market' | 'escrow';
export type LedgerAccountKind = 'cash' | 'savings' | 'escrow' | 'clearing';

/** Well-known system owners. Their accounts may run negative. */
export const SYSTEM_BANK_ID = '00000000-0000-4000-8000-0000000000b1';
export const SYSTEM_GOVERNMENT_ID = '00000000-0000-4000-8000-0000000000b2';
export const SYSTEM_MARKET_ID = '00000000-0000-4000-8000-0000000000b3';
export const SYSTEM_ESCROW_ID = '00000000-0000-4000-8000-0000000000b4';

export interface LedgerLeg {
  ownerType: LedgerOwnerType;
  ownerId: string;
  /** Defaults to `cash`. */
  kind?: LedgerAccountKind;
  /** Positive increases the account balance, negative decreases it. */
  deltaMinor: number;
}

export interface PostOptions {
  kind: string;
  description: string;
  legs: LedgerLeg[];
  referenceType?: string;
  referenceId?: string;
}

function isSystemOwner(ownerType: LedgerOwnerType): boolean {
  return ownerType === 'bank' || ownerType === 'government' || ownerType === 'market';
}

/**
 * Double-entry ledger.
 *
 * Every money movement in EFLS is one `post()` call: legs must balance to zero
 * and each leg updates exactly one account. Character cash accounts mirror
 * `characters.cash_minor` so existing read paths stay fast.
 *
 * Must be called inside a transaction (`withTransaction`).
 */
export class LedgerService {
  async ensureAccount(
    db: Db,
    ownerType: LedgerOwnerType,
    ownerId: string,
    kind: LedgerAccountKind = 'cash',
  ): Promise<string> {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM ledger_accounts
       WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'USD'
       LIMIT 1`,
      [ownerType, ownerId, kind],
    );
    if (existing.rows[0]) return existing.rows[0].id;

    // A character cash account starts from the legacy column so balances that
    // predate the ledger are preserved exactly once.
    let openingBalance = 0;
    if (ownerType === 'character' && kind === 'cash') {
      const character = await db.query<{ cash_minor: string }>(
        `SELECT cash_minor FROM characters WHERE id = $1`,
        [ownerId],
      );
      openingBalance = Number(character.rows[0]?.cash_minor ?? 0);
    }

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO ledger_accounts
         (id, owner_type, owner_id, kind, balance_minor, is_system)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (owner_type, owner_id, kind, currency) DO NOTHING
       RETURNING id`,
      [ownerType, ownerId, kind, openingBalance, isSystemOwner(ownerType)],
    );
    if (inserted.rows[0]) return inserted.rows[0].id;

    const raced = await db.query<{ id: string }>(
      `SELECT id FROM ledger_accounts
       WHERE owner_type = $1 AND owner_id = $2 AND kind = $3 AND currency = 'USD'
       LIMIT 1`,
      [ownerType, ownerId, kind],
    );
    if (!raced.rows[0]) throw new Error('Failed to create ledger account');
    return raced.rows[0].id;
  }

  async getBalance(
    db: Db,
    ownerType: LedgerOwnerType,
    ownerId: string,
    kind: LedgerAccountKind = 'cash',
  ): Promise<number> {
    const accountId = await this.ensureAccount(db, ownerType, ownerId, kind);
    const result = await db.query<{ balance_minor: string }>(
      `SELECT balance_minor FROM ledger_accounts WHERE id = $1`,
      [accountId],
    );
    return Number(result.rows[0]?.balance_minor ?? 0);
  }

  /**
   * Post a balanced journal entry. Throws `insufficient_funds` if a non-system
   * account would go negative.
   */
  async post(client: PoolClient, options: PostOptions): Promise<string> {
    if (options.legs.length < 2) {
      throw new Error('A ledger transaction needs at least two legs');
    }
    const sum = options.legs.reduce((total, leg) => total + leg.deltaMinor, 0);
    if (sum !== 0) {
      throw new Error(`Unbalanced ledger transaction: legs sum to ${sum}`);
    }
    for (const leg of options.legs) {
      if (!Number.isSafeInteger(leg.deltaMinor) || leg.deltaMinor === 0) {
        throw new Error('Ledger deltas must be non-zero safe integers');
      }
    }

    const transactionId = crypto.randomUUID();
    await client.query(
      `INSERT INTO ledger_transactions (id, kind, description, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        transactionId,
        options.kind,
        options.description,
        options.referenceType ?? null,
        options.referenceId ?? null,
      ],
    );

    const characterCashAccountIds: string[] = [];

    for (const leg of options.legs) {
      const kind = leg.kind ?? 'cash';
      const accountId = await this.ensureAccount(client, leg.ownerType, leg.ownerId, kind);

      const updated = await client.query<{ balance_minor: string }>(
        `UPDATE ledger_accounts
         SET balance_minor = balance_minor + $2, updated_at = now()
         WHERE id = $1 AND (is_system OR balance_minor + $2 >= 0)
         RETURNING balance_minor`,
        [accountId, leg.deltaMinor],
      );
      if (!updated.rows[0]) {
        throw AppError.conflict(
          'insufficient_funds',
          `Insufficient funds for ${leg.ownerType} ${leg.ownerId}`,
        );
      }

      await client.query(
        `INSERT INTO ledger_entries (id, transaction_id, account_id, delta_minor)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [transactionId, accountId, leg.deltaMinor],
      );

      if (leg.ownerType === 'character' && kind === 'cash') {
        characterCashAccountIds.push(accountId);
      }
    }

    if (characterCashAccountIds.length > 0) {
      await client.query(
        `UPDATE characters c
         SET cash_minor = a.balance_minor, updated_at = now()
         FROM ledger_accounts a
         WHERE a.owner_id = c.id AND a.owner_type = 'character' AND a.kind = 'cash'
           AND a.id = ANY($1::uuid[])`,
        [characterCashAccountIds],
      );
    }

    return transactionId;
  }

  /** Convenience for a single payer -> payee cash transfer. */
  async transfer(
    client: PoolClient,
    input: {
      from: { ownerType: LedgerOwnerType; ownerId: string; kind?: LedgerAccountKind };
      to: { ownerType: LedgerOwnerType; ownerId: string; kind?: LedgerAccountKind };
      amountMinor: number;
      kind: string;
      description: string;
      referenceType?: string;
      referenceId?: string;
    },
  ): Promise<string> {
    return this.post(client, {
      kind: input.kind,
      description: input.description,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      legs: [
        { ...input.from, deltaMinor: -input.amountMinor },
        { ...input.to, deltaMinor: input.amountMinor },
      ],
    });
  }
}

export const ledger = new LedgerService();
