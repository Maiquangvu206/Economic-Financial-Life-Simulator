import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface EvidenceRow {
  id: string;
  targetCharacterId: string;
  targetName: string | null;
  strength: number;
  description: string;
  status: string;
  createdAt: Date;
}

export interface StingRow {
  id: string;
  targetCharacterId: string;
  targetName: string | null;
  amountMinor: string;
  result: string;
  createdAt: Date;
}

export interface ProtectionRow {
  id: string;
  kind: string;
  coverageAmountMinor: string;
  premiumMinor: string;
  status: string;
  expiresAt: Date;
}

export interface SweepRow {
  id: string;
  triggerHeat: number;
  fineMinor: string;
  prisonDays: number;
  createdAt: Date;
}

export interface BlackmailRow {
  id: string;
  blackmailerId: string;
  targetId: string;
  targetName: string | null;
  monthlyPaymentMinor: string;
  status: string;
  expiresAt: Date | null;
}

/** Truy cập chợ đen / thám tử: bằng chứng, sting, blackmail, bảo vệ, càn quét. */
export class UnderworldRepository {
  constructor(readonly db: Db = pool) {}

  async listHeatEvents(
    characterId: string,
    db: Db = this.db,
  ): Promise<{ id: string; delta: number; reason: string; createdAt: Date }[]> {
    const result = await db.query(
      `SELECT id, delta, reason, created_at AS "createdAt"
       FROM heat_events WHERE character_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [characterId],
    );
    return result.rows;
  }

  async insertHeatEvent(
    client: Db,
    characterId: string,
    delta: number,
    reason: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO heat_events (id, character_id, delta, reason)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [characterId, delta, reason],
    );
  }

  async setHeat(client: Db, characterId: string, heat: number): Promise<void> {
    await client.query(`UPDATE characters SET heat_level = $2, updated_at = now() WHERE id = $1`, [
      characterId,
      heat,
    ]);
  }

  async listCredentials(
    characterId: string,
    db: Db = this.db,
  ): Promise<{ id: string; kind: string; quality: number; active: boolean; createdAt: Date }[]> {
    const result = await db.query(
      `SELECT id, kind, quality, active, created_at AS "createdAt"
       FROM fake_credentials WHERE character_id = $1 ORDER BY created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async insertCredential(
    client: Db,
    characterId: string,
    kind: string,
    quality: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO fake_credentials (id, character_id, kind, quality, active)
       VALUES (gen_random_uuid(), $1, $2, $3, true)
       RETURNING id`,
      [characterId, kind, quality],
    );
    return result.rows[0]!.id;
  }

  async insertMercenaryOrder(
    client: Db,
    clientId: string,
    targetId: string,
    kind: string,
    priceMinor: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO mercenary_orders (id, client_id, target_id, kind, price_minor, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'completed')
       RETURNING id`,
      [clientId, targetId, kind, priceMinor],
    );
    return result.rows[0]!.id;
  }

  async listEvidences(characterId: string, db: Db = this.db): Promise<EvidenceRow[]> {
    const result = await db.query<EvidenceRow>(
      `SELECT e.id, e.target_character_id AS "targetCharacterId", t.full_name AS "targetName",
              e.strength, e.description, e.status, e.created_at AS "createdAt"
       FROM underworld_evidences e
       LEFT JOIN characters t ON t.id = e.target_character_id
       WHERE e.owner_character_id = $1 ORDER BY e.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getEvidence(evidenceId: string, db: Db = this.db): Promise<EvidenceRow | null> {
    const result = await db.query<EvidenceRow>(
      `SELECT e.id, e.target_character_id AS "targetCharacterId", t.full_name AS "targetName",
              e.strength, e.description, e.status, e.created_at AS "createdAt"
       FROM underworld_evidences e
       LEFT JOIN characters t ON t.id = e.target_character_id
       WHERE e.id = $1`,
      [evidenceId],
    );
    return result.rows[0] ?? null;
  }

  async createEvidence(
    client: Db,
    ownerCharacterId: string,
    targetCharacterId: string,
    strength: number,
    description: string,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO underworld_evidences
         (id, owner_character_id, target_character_id, strength, description, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'held')
       RETURNING id`,
      [ownerCharacterId, targetCharacterId, strength, description],
    );
    return result.rows[0]!.id;
  }

  async setEvidenceStatus(client: Db, evidenceId: string, status: string): Promise<void> {
    await client.query(`UPDATE underworld_evidences SET status = $2 WHERE id = $1`, [
      evidenceId,
      status,
    ]);
  }

  async listBlackmails(characterId: string, db: Db = this.db): Promise<BlackmailRow[]> {
    const result = await db.query<BlackmailRow>(
      `SELECT b.id, b.blackmailer_id AS "blackmailerId", b.target_id AS "targetId",
              t.full_name AS "targetName", b.monthly_payment_minor AS "monthlyPaymentMinor",
              b.status, b.expires_at AS "expiresAt"
       FROM blackmail_contracts b
       LEFT JOIN characters t ON t.id = b.target_id
       WHERE b.blackmailer_id = $1 ORDER BY b.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async createBlackmail(
    client: Db,
    blackmailerId: string,
    targetId: string,
    monthlyPaymentMinor: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO blackmail_contracts
         (id, blackmailer_id, target_id, monthly_payment_minor, status, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', now() + interval '6 months')
       RETURNING id`,
      [blackmailerId, targetId, monthlyPaymentMinor],
    );
    return result.rows[0]!.id;
  }

  async getBlackmail(blackmailId: string, db: Db = this.db): Promise<BlackmailRow | null> {
    const result = await db.query<BlackmailRow>(
      `SELECT b.id, b.blackmailer_id AS "blackmailerId", b.target_id AS "targetId",
              t.full_name AS "targetName", b.monthly_payment_minor AS "monthlyPaymentMinor",
              b.status, b.expires_at AS "expiresAt"
       FROM blackmail_contracts b
       LEFT JOIN characters t ON t.id = b.target_id
       WHERE b.id = $1`,
      [blackmailId],
    );
    return result.rows[0] ?? null;
  }

  async listStings(characterId: string, db: Db = this.db): Promise<StingRow[]> {
    const result = await db.query<StingRow>(
      `SELECT s.id, s.target_character_id AS "targetCharacterId", t.full_name AS "targetName",
              s.amount_minor AS "amountMinor", s.result, s.created_at AS "createdAt"
       FROM sting_operations s
       LEFT JOIN characters t ON t.id = s.target_character_id
       WHERE s.character_id = $1 ORDER BY s.created_at DESC LIMIT 20`,
      [characterId],
    );
    return result.rows;
  }

  async createSting(
    client: Db,
    characterId: string,
    targetCharacterId: string,
    amountMinor: number,
    result: string,
  ): Promise<string> {
    const row = await client.query<{ id: string }>(
      `INSERT INTO sting_operations
         (id, character_id, target_character_id, amount_minor, result, resolved_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
       RETURNING id`,
      [characterId, targetCharacterId, amountMinor, result],
    );
    return row.rows[0]!.id;
  }

  async listProtections(characterId: string, db: Db = this.db): Promise<ProtectionRow[]> {
    const result = await db.query<ProtectionRow>(
      `SELECT id, kind, coverage_amount_minor AS "coverageAmountMinor",
              premium_minor AS "premiumMinor", status, expires_at AS "expiresAt"
       FROM insurance_policies WHERE character_id = $1 ORDER BY created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async createProtection(
    client: Db,
    characterId: string,
    kind: string,
    coverageAmountMinor: number,
    premiumMinor: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO insurance_policies
         (id, character_id, kind, coverage_amount_minor, premium_minor, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'active')
       RETURNING id`,
      [characterId, kind, coverageAmountMinor, premiumMinor],
    );
    return result.rows[0]!.id;
  }

  async listSweeps(characterId: string, db: Db = this.db): Promise<SweepRow[]> {
    const result = await db.query<SweepRow>(
      `SELECT id, trigger_heat AS "triggerHeat", fine_minor AS "fineMinor",
              prison_days AS "prisonDays", created_at AS "createdAt"
       FROM police_sweeps WHERE character_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [characterId],
    );
    return result.rows;
  }

  async createSweep(
    client: Db,
    characterId: string,
    triggerHeat: number,
    fineMinor: number,
    prisonDays: number,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO police_sweeps
         (id, character_id, trigger_heat, fine_minor, prison_days)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id`,
      [characterId, triggerHeat, fineMinor, prisonDays],
    );
    return result.rows[0]!.id;
  }

  /** Tổng thu ngầm đã nhận trong 30 ngày qua (từ ledger_transactions kind like crime%). */
  async undergroundEarned(characterId: string): Promise<number> {
    const result = await this.db.query<{ total: string }>(
      `SELECT COALESCE(SUM(le.delta_minor), 0) AS total
       FROM ledger_entries le
       JOIN ledger_accounts la ON la.id = le.account_id
       JOIN ledger_transactions lt ON lt.id = le.transaction_id
       WHERE la.owner_type = 'character' AND la.owner_id = $1 AND la.kind = 'cash'
         AND le.delta_minor > 0 AND lt.kind LIKE 'crime_%'
         AND lt.created_at >= now() - interval '30 days'`,
      [characterId],
    );
    return Number(result.rows[0]?.total ?? 0);
  }
}

export const underworldRepository = new UnderworldRepository();
