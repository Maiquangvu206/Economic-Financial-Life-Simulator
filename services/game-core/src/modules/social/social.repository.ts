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

export interface MarriageProposalRow {
  id: string;
  proposerCharacterId: string;
  proposerName: string;
  targetCharacterId: string;
  targetName: string;
  prenupEnabled: boolean;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
}

export interface DivorceProposalRow {
  id: string;
  marriageId: string;
  requesterCharacterId: string;
  requesterName: string;
  otherCharacterId: string;
  otherName: string;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
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

export interface WillHeirRow {
  characterId: string;
  characterName: string;
  sharePct: string;
  relationship: string;
  note: string | null;
}

export interface TrustFundRow {
  id: string;
  beneficiaryId: string | null;
  beneficiaryName: string | null;
  balanceMinor: string;
}

/** Truy cập hôn nhân / đề xuất / gia tộc / di chúc / trust fund. */
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

  async listMarriageProposals(characterId: string, db: Db = this.db): Promise<MarriageProposalRow[]> {
    const result = await db.query<MarriageProposalRow>(
      `SELECT p.id,
              p.proposer_character_id AS "proposerCharacterId", pc.full_name AS "proposerName",
              p.target_character_id AS "targetCharacterId", tc.full_name AS "targetName",
              p.prenup_enabled AS "prenupEnabled", p.status,
              p.created_at AS "createdAt", p.responded_at AS "respondedAt"
       FROM marriage_proposals p
       JOIN characters pc ON pc.id = p.proposer_character_id
       JOIN characters tc ON tc.id = p.target_character_id
       WHERE (p.proposer_character_id = $1 OR p.target_character_id = $1)
         AND p.status = 'pending'
       ORDER BY p.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getMarriageProposal(proposalId: string, db: Db = this.db): Promise<MarriageProposalRow | null> {
    const result = await db.query<MarriageProposalRow>(
      `SELECT p.id,
              p.proposer_character_id AS "proposerCharacterId", pc.full_name AS "proposerName",
              p.target_character_id AS "targetCharacterId", tc.full_name AS "targetName",
              p.prenup_enabled AS "prenupEnabled", p.status,
              p.created_at AS "createdAt", p.responded_at AS "respondedAt"
       FROM marriage_proposals p
       JOIN characters pc ON pc.id = p.proposer_character_id
       JOIN characters tc ON tc.id = p.target_character_id
       WHERE p.id = $1`,
      [proposalId],
    );
    return result.rows[0] ?? null;
  }

  async findPendingMarriageProposal(a: string, b: string, db: Db = this.db): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM marriage_proposals
       WHERE status = 'pending'
         AND ((proposer_character_id = $1 AND target_character_id = $2)
           OR (proposer_character_id = $2 AND target_character_id = $1))
       LIMIT 1`,
      [a, b],
    );
    return result.rows[0]?.id ?? null;
  }

  async createMarriageProposal(client: Db, proposerId: string, targetId: string, prenupEnabled: boolean): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO marriage_proposals (id, proposer_character_id, target_character_id, prenup_enabled, status)
       VALUES (gen_random_uuid(), $1, $2, $3, 'pending')
       RETURNING id`,
      [proposerId, targetId, prenupEnabled],
    );
    return result.rows[0]!.id;
  }

  async setMarriageProposalStatus(client: Db, proposalId: string, status: string): Promise<void> {
    await client.query(
      `UPDATE marriage_proposals SET status = $2, responded_at = now() WHERE id = $1`,
      [proposalId, status],
    );
  }

  async listDivorceProposals(characterId: string, db: Db = this.db): Promise<DivorceProposalRow[]> {
    const result = await db.query<DivorceProposalRow>(
      `SELECT d.id, d.marriage_id AS "marriageId",
              d.requester_character_id AS "requesterCharacterId", rc.full_name AS "requesterName",
              CASE WHEN m.character_id = d.requester_character_id THEN m.spouse_id ELSE m.character_id END AS "otherCharacterId",
              oc.full_name AS "otherName",
              d.status, d.created_at AS "createdAt", d.responded_at AS "respondedAt"
       FROM divorce_proposals d
       JOIN marriage_contracts m ON m.id = d.marriage_id
       JOIN characters rc ON rc.id = d.requester_character_id
       JOIN characters oc ON oc.id = (CASE WHEN m.character_id = d.requester_character_id THEN m.spouse_id ELSE m.character_id END)
       WHERE (m.character_id = $1 OR m.spouse_id = $1)
         AND d.status = 'pending'
       ORDER BY d.created_at DESC`,
      [characterId],
    );
    return result.rows;
  }

  async getDivorceProposal(proposalId: string, db: Db = this.db): Promise<DivorceProposalRow | null> {
    const result = await db.query<DivorceProposalRow>(
      `SELECT d.id, d.marriage_id AS "marriageId",
              d.requester_character_id AS "requesterCharacterId", rc.full_name AS "requesterName",
              CASE WHEN m.character_id = d.requester_character_id THEN m.spouse_id ELSE m.character_id END AS "otherCharacterId",
              oc.full_name AS "otherName",
              d.status, d.created_at AS "createdAt", d.responded_at AS "respondedAt"
       FROM divorce_proposals d
       JOIN marriage_contracts m ON m.id = d.marriage_id
       JOIN characters rc ON rc.id = d.requester_character_id
       JOIN characters oc ON oc.id = (CASE WHEN m.character_id = d.requester_character_id THEN m.spouse_id ELSE m.character_id END)
       WHERE d.id = $1`,
      [proposalId],
    );
    return result.rows[0] ?? null;
  }

  async findPendingDivorceProposal(marriageId: string, db: Db = this.db): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `SELECT id FROM divorce_proposals WHERE marriage_id = $1 AND status = 'pending' LIMIT 1`,
      [marriageId],
    );
    return result.rows[0]?.id ?? null;
  }

  async createDivorceProposal(client: Db, marriageId: string, requesterId: string): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO divorce_proposals (id, marriage_id, requester_character_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'pending')
       RETURNING id`,
      [marriageId, requesterId],
    );
    return result.rows[0]!.id;
  }

  async setDivorceProposalStatus(client: Db, proposalId: string, status: string): Promise<void> {
    await client.query(
      `UPDATE divorce_proposals SET status = $2, responded_at = now() WHERE id = $1`,
      [proposalId, status],
    );
  }

  async getUserIdByCharacterId(characterId: string, db: Db = this.db): Promise<string | null> {
    const result = await db.query<{ user_id: string }>(
      `SELECT user_id FROM characters WHERE id = $1`,
      [characterId],
    );
    return result.rows[0]?.user_id ?? null;
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

  async listWillHeirs(willId: string, db: Db = this.db): Promise<WillHeirRow[]> {
    const result = await db.query<WillHeirRow>(
      `SELECT wh.heir_character_id AS "characterId",
              c.full_name AS "characterName",
              wh.share_pct AS "sharePct",
              wh.relationship,
              wh.note
       FROM will_heirs wh
       JOIN characters c ON c.id = wh.heir_character_id
       WHERE wh.will_id = $1
       ORDER BY wh.share_pct DESC, wh.created_at ASC`,
      [willId],
    );
    return result.rows;
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

  async replaceWillHeirs(
    client: Db,
    willId: string,
    heirs: Array<{ characterId: string; sharePct: number; relationship: string; note: string | null }>,
  ): Promise<void> {
    await client.query(`DELETE FROM will_heirs WHERE will_id = $1`, [willId]);
    for (const h of heirs) {
      await client.query(
        `INSERT INTO will_heirs (will_id, heir_character_id, share_pct, relationship, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [willId, h.characterId, h.sharePct, h.relationship, h.note],
      );
    }
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

  async listWillBeneficiaries(willId: string, db: Db = this.db): Promise<Array<{ beneficiaryCccd: string; beneficiaryCharacterId: string | null; beneficiaryName: string | null; sharePct: string; relationship: string; note: string | null }>> {
    const r = await db.query<any>(
      `SELECT wb.beneficiary_cccd AS "beneficiaryCccd",
              wb.beneficiary_character_id AS "beneficiaryCharacterId",
              c.full_name AS "beneficiaryName",
              wb.share_pct AS "sharePct",
              wb.relationship,
              wb.note
       FROM will_beneficiaries wb
       LEFT JOIN characters c ON c.id = wb.beneficiary_character_id OR c.cccd = wb.beneficiary_cccd
       WHERE wb.will_id = $1
       ORDER BY wb.share_pct DESC, wb.created_at ASC`,
      [willId],
    );
    return r.rows;
  }

  async replaceWillBeneficiaries(
    client: Db,
    willId: string,
    heirs: Array<{ beneficiaryCccd: string; beneficiaryCharacterId: string | null; sharePct: number; relationship: string; note: string | null }>,
  ): Promise<void> {
    await client.query(`DELETE FROM will_beneficiaries WHERE will_id = $1`, [willId]);
    for (const h of heirs) {
      await client.query(
        `INSERT INTO will_beneficiaries (will_id, beneficiary_cccd, beneficiary_character_id, share_pct, relationship, note, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (will_id, beneficiary_cccd) DO UPDATE SET beneficiary_character_id = EXCLUDED.beneficiary_character_id, share_pct = EXCLUDED.share_pct, relationship = EXCLUDED.relationship, note = EXCLUDED.note, updated_at = now()`,
        [willId, h.beneficiaryCccd, h.beneficiaryCharacterId, h.sharePct, h.relationship, h.note],
      );
    }
  }

  async listTrustFundBeneficiaries(trustFundId: string, db: Db = this.db): Promise<Array<{ beneficiaryCccd: string; beneficiaryName: string | null; sharePct: string }>> {
    const r = await db.query<any>(
      `SELECT tfb.beneficiary_cccd AS "beneficiaryCccd", c.full_name AS "beneficiaryName", tfb.share_pct AS "sharePct"
       FROM trust_fund_beneficiaries tfb
       LEFT JOIN characters c ON c.id = tfb.beneficiary_character_id OR c.cccd = tfb.beneficiary_cccd
       WHERE tfb.trust_fund_id = $1
       ORDER BY tfb.share_pct DESC`,
      [trustFundId],
    );
    return r.rows;
  }

  async replaceTrustFundBeneficiaries(
    client: Db,
    trustFundId: string,
    beneficiaries: Array<{ beneficiaryCccd: string; beneficiaryCharacterId: string | null; sharePct: number }>,
  ): Promise<void> {
    await client.query(`DELETE FROM trust_fund_beneficiaries WHERE trust_fund_id = $1`, [trustFundId]);
    for (const b of beneficiaries) {
      await client.query(
        `INSERT INTO trust_fund_beneficiaries (trust_fund_id, beneficiary_cccd, beneficiary_character_id, share_pct, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (trust_fund_id, beneficiary_cccd) DO UPDATE SET beneficiary_character_id = EXCLUDED.beneficiary_character_id, share_pct = EXCLUDED.share_pct, updated_at = now()`,
        [trustFundId, b.beneficiaryCccd, b.beneficiaryCharacterId, b.sharePct],
      );
    }
  }
}


export const socialRepository = new SocialRepository();
