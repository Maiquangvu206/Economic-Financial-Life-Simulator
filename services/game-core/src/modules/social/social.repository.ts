import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface MarriageRow {
  id: string;
  characterId: string;
  characterName: string;
  spouseId: string;
  spouseName: string;
  prenupEnabled: boolean;
  status: string;
  marriedAt: Date;
  endedAt: Date | null;
}

export interface FamilyRow {
  characterId: string;
  characterName: string;
  relationship: string;
  parentId: string | null;
  generationLevel: number;
  inheritancePct: string;
}

export interface WillRow {
  id: string;
  primaryHeirId: string | null;
  primaryHeirName: string | null;
  trustFundEnabled: boolean;
  updatedAt: Date | null;
}

export interface TrustFundRow {
  id: string;
  beneficiaryId: string | null;
  beneficiaryName: string | null;
  balanceMinor: string;
}

/** Truy cập hôn nhân / gia tộc / di chúc / trust fund. */
export class SocialRepository {
  constructor(readonly db: Db = pool) {}

  async listMarriages(characterId: string, db: Db = this.db): Promise<MarriageRow[]> {
    const result = await db.query<MarriageRow>(
      `SELECT m.id, m.character_id AS "characterId", c.full_name AS "characterName",
              m.spouse_id AS "spouseId", s.full_name AS "spouseName",
              m.prenup_enabled AS "prenupEnabled", m.status,
              m.married_at AS "marriedAt", m.ended_at AS "endedAt"
       FROM marriage_contracts m
       JOIN characters c ON c.id = m.character_id
       JOIN characters s ON s.id = m.spouse_id
       WHERE m.character_id = $1 OR m.spouse_id = $1
       ORDER BY m.married_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getMarriage(marriageId: string, db: Db = this.db): Promise<MarriageRow | null> {
    const result = await db.query<MarriageRow>(
      `SELECT m.id, m.character_id AS "characterId", c.full_name AS "characterName",
              m.spouse_id AS "spouseId", s.full_name AS "spouseName",
              m.prenup_enabled AS "prenupEnabled", m.status,
              m.married_at AS "marriedAt", m.ended_at AS "endedAt"
       FROM marriage_contracts m
       JOIN characters c ON c.id = m.character_id
       JOIN characters s ON s.id = m.spouse_id
       WHERE m.id = $1`,
      [marriageId],
    );
    return result.rows[0] ?? null;
  }

  async createMarriage(
    client: Db,
    characterId: string,
    spouseId: string,
    prenupEnabled: boolean,
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO marriage_contracts (id, character_id, spouse_id, prenup_enabled, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active')
       RETURNING id`,
      [characterId, spouseId, prenupEnabled],
    );
    return result.rows[0]!.id;
  }

  async endMarriage(client: Db, marriageId: string, status: string): Promise<void> {
    await client.query(
      `UPDATE marriage_contracts SET status = $2, ended_at = now(), updated_at = now() WHERE id = $1`,
      [marriageId, status],
    );
  }

  async listFamily(characterId: string, db: Db = this.db): Promise<FamilyRow[]> {
    const result = await db.query<FamilyRow>(
      `SELECT f.character_id AS "characterId", c.full_name AS "characterName",
              CASE WHEN f.parent_id = $1 THEN 'Con' ELSE 'Người thân' END AS relationship,
              f.parent_id AS "parentId", f.generation_level AS "generationLevel",
              f.inheritance_pct AS "inheritancePct"
       FROM family_trees f
       JOIN characters c ON c.id = f.character_id
       WHERE f.character_id = $1 OR f.parent_id = $1
       ORDER BY f.generation_level ASC`,
      [characterId],
    );
    return result.rows;
  }

  async getWill(characterId: string, db: Db = this.db): Promise<WillRow | null> {
    const result = await db.query<WillRow>(
      `SELECT w.id, w.primary_heir_id AS "primaryHeirId", h.full_name AS "primaryHeirName",
              w.trust_fund_enabled AS "trustFundEnabled", w.updated_at AS "updatedAt"
       FROM wills w
       LEFT JOIN characters h ON h.id = w.primary_heir_id
       WHERE w.character_id = $1`,
      [characterId],
    );
    return result.rows[0] ?? null;
  }

  async upsertWill(
    client: Db,
    characterId: string,
    primaryHeirId: string | null,
    trustFundEnabled: boolean,
  ): Promise<WillRow> {
    const existing = await this.getWill(characterId, client);
    if (existing) {
      await client.query(
        `UPDATE wills
         SET primary_heir_id = $2, trust_fund_enabled = $3, updated_at = now()
         WHERE id = $1`,
        [existing.id, primaryHeirId, trustFundEnabled],
      );
    } else {
      await client.query(
        `INSERT INTO wills (id, character_id, primary_heir_id, trust_fund_enabled)
         VALUES (gen_random_uuid(), $1, $2, $3)`,
        [characterId, primaryHeirId, trustFundEnabled],
      );
    }
    const updated = await this.getWill(characterId, client);
    if (!updated) throw new Error('Will disappeared during upsert');
    return updated;
  }

  async listTrustFunds(characterId: string, db: Db = this.db): Promise<TrustFundRow[]> {
    const result = await db.query<TrustFundRow>(
      `SELECT t.id, t.beneficiary_id AS "beneficiaryId", b.full_name AS "beneficiaryName",
              t.balance_minor AS "balanceMinor"
       FROM trust_funds t
       LEFT JOIN characters b ON b.id = t.beneficiary_id
       WHERE t.character_id = $1`,
      [characterId],
    );
    return result.rows;
  }

  async getTrustFund(client: Db, characterId: string): Promise<TrustFundRow | null> {
    const result = await client.query<TrustFundRow>(
      `SELECT t.id, t.beneficiary_id AS "beneficiaryId", b.full_name AS "beneficiaryName",
              t.balance_minor AS "balanceMinor"
       FROM trust_funds t
       LEFT JOIN characters b ON b.id = t.beneficiary_id
       WHERE t.character_id = $1`,
      [characterId],
    );
    return result.rows[0] ?? null;
  }

  async createTrustFund(client: Db, characterId: string): Promise<string> {
    const existing = await this.getTrustFund(client, characterId);
    if (existing) return existing.id;
    const result = await client.query<{ id: string }>(
      `INSERT INTO trust_funds (id, character_id, balance_minor)
       VALUES (gen_random_uuid(), $1, 0)
       RETURNING id`,
      [characterId],
    );
    return result.rows[0]!.id;
  }

  async depositTrustFund(client: Db, characterId: string, amountMinor: number): Promise<void> {
    await client.query(
      `UPDATE trust_funds SET balance_minor = balance_minor + $2, updated_at = now() WHERE character_id = $1`,
      [characterId, amountMinor],
    );
  }
}

export const socialRepository = new SocialRepository();
