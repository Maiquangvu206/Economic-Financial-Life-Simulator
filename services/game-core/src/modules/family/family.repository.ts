import type { PoolClient } from 'pg';
import { pool } from '../../shared/db/pool.js';
import type { Db } from '../../shared/db/tx.js';

export interface GameStateRow {
  current_year: number;
  current_day: number;
}

export interface ChildRow {
  id: string;
  full_name: string;
  age: number;
  is_adopted: boolean;
  is_dependent: boolean;
  dependent_status: string;
  wellbeing: number | null;
  care_tier: string | null;
  care_debt_minor: string;
  unpaid_care_days: number;
  parent_1_id: string | null;
  parent_1_name: string | null;
  parent_2_id: string | null;
  parent_2_name: string | null;
  custodial_parent_id: string | null;
  custodial_parent_name: string | null;
  child_support_percent: number;
  child_support_payer_id: string | null;
  child_support_payer_name: string | null;
  is_alive: boolean;
  birth_game_year: number | null;
  birth_game_day: number | null;
}

export interface PregnancyRow {
  id: string;
  pregnant_character_id: string;
  pregnant_name: string;
  other_parent_character_id: string;
  other_parent_name: string;
  status: string;
  start_game_year: number;
  start_game_day: number;
  due_game_year: number;
  due_game_day: number;
  health_warning_days: number;
  child_character_id: string | null;
  miscarriage_reason: string | null;
  created_at: Date;
}

export interface BirthProposalRow {
  id: string;
  proposer_character_id: string;
  proposer_name: string;
  partner_character_id: string;
  partner_name: string;
  status: string;
  created_at: Date;
  responded_at: Date | null;
}

export interface AdoptionApplicationRow {
  id: string;
  applicant_character_id: string;
  applicant_name: string;
  spouse_character_id: string | null;
  spouse_name: string | null;
  child_character_id: string;
  child_name: string;
  status: string;
  applied_game_year: number;
  applied_game_day: number;
  review_complete_game_year: number;
  review_complete_game_day: number;
  spouse_approved: boolean | null;
  created_at: Date;
  completed_at: Date | null;
}

export interface AdoptableChildRow {
  id: string;
  full_name: string;
  age: number;
  wellbeing: number | null;
}

export class FamilyRepository {
  constructor(public readonly db = pool) {}

  async getGameState(db: Db = this.db): Promise<GameStateRow> {
    const r = await db.query<{ current_year: string; current_day: string }>(
      `SELECT current_year, current_day FROM game_state WHERE id = 1`,
    );
    const row = r.rows[0];
    if (!row) throw new Error('game_state missing');
    return { current_year: Number(row.current_year), current_day: Number(row.current_day) };
  }

  async listChildrenForCharacter(characterId: string, db: Db = this.db): Promise<ChildRow[]> {
    const r = await db.query<ChildRow>(
      `SELECT c.id, c.full_name, c.age, COALESCE(c.is_adopted,false) AS is_adopted,
              COALESCE(c.is_dependent,false) AS is_dependent,
              COALESCE(c.dependent_status,'none') AS dependent_status,
              c.wellbeing, c.care_tier,
              COALESCE(c.care_debt_minor,0)::text AS care_debt_minor,
              COALESCE(c.unpaid_care_days,0)::int AS unpaid_care_days,
              c.parent_1_id, p1.full_name AS parent_1_name,
              c.parent_2_id, p2.full_name AS parent_2_name,
              c.custodial_parent_id, cu.full_name AS custodial_parent_name,
              COALESCE(c.child_support_percent,0)::int AS child_support_percent,
              c.child_support_payer_id, sp.full_name AS child_support_payer_name,
              COALESCE(c.is_alive,true) AS is_alive,
              c.birth_game_year, c.birth_game_day
       FROM characters c
       LEFT JOIN characters p1 ON p1.id = c.parent_1_id
       LEFT JOIN characters p2 ON p2.id = c.parent_2_id
       LEFT JOIN characters cu ON cu.id = c.custodial_parent_id
       LEFT JOIN characters sp ON sp.id = c.child_support_payer_id
       WHERE (c.parent_1_id = $1 OR c.parent_2_id = $1 OR c.custodial_parent_id = $1)
         AND (COALESCE(c.is_dependent,false) = true OR c.dependent_status IN ('infant','child','adult','lost_custody'))
       ORDER BY c.age ASC, c.created_at ASC`,
      [characterId],
    );
    return r.rows;
  }

  async getChildForParent(childId: string, parentId: string, db: Db = this.db): Promise<ChildRow | null> {
    const r = await db.query<ChildRow>(
      `SELECT c.id, c.full_name, c.age, COALESCE(c.is_adopted,false) AS is_adopted,
              COALESCE(c.is_dependent,false) AS is_dependent,
              COALESCE(c.dependent_status,'none') AS dependent_status,
              c.wellbeing, c.care_tier,
              COALESCE(c.care_debt_minor,0)::text AS care_debt_minor,
              COALESCE(c.unpaid_care_days,0)::int AS unpaid_care_days,
              c.parent_1_id, p1.full_name AS parent_1_name,
              c.parent_2_id, p2.full_name AS parent_2_name,
              c.custodial_parent_id, cu.full_name AS custodial_parent_name,
              COALESCE(c.child_support_percent,0)::int AS child_support_percent,
              c.child_support_payer_id, sp.full_name AS child_support_payer_name,
              COALESCE(c.is_alive,true) AS is_alive,
              c.birth_game_year, c.birth_game_day
       FROM characters c
       LEFT JOIN characters p1 ON p1.id = c.parent_1_id
       LEFT JOIN characters p2 ON p2.id = c.parent_2_id
       LEFT JOIN characters cu ON cu.id = c.custodial_parent_id
       LEFT JOIN characters sp ON sp.id = c.child_support_payer_id
       WHERE c.id = $1 AND (c.parent_1_id = $2 OR c.parent_2_id = $2 OR c.custodial_parent_id = $2)
       LIMIT 1`,
      [childId, parentId],
    );
    return r.rows[0] ?? null;
  }

  async listActivePregnanciesForCharacter(characterId: string, db: Db = this.db): Promise<PregnancyRow[]> {
    const r = await db.query<PregnancyRow>(
      `SELECT pr.id, pr.pregnant_character_id, pc.full_name AS pregnant_name,
              pr.other_parent_character_id, oc.full_name AS other_parent_name,
              pr.status, pr.start_game_year, pr.start_game_day, pr.due_game_year, pr.due_game_day,
              pr.health_warning_days, pr.child_character_id, pr.miscarriage_reason, pr.created_at
       FROM pregnancies pr
       JOIN characters pc ON pc.id = pr.pregnant_character_id
       JOIN characters oc ON oc.id = pr.other_parent_character_id
       WHERE pr.status = 'active' AND (pr.pregnant_character_id = $1 OR pr.other_parent_character_id = $1)
       ORDER BY pr.created_at DESC`,
      [characterId],
    );
    return r.rows;
  }

  async listBirthProposalsForCharacter(characterId: string, db: Db = this.db): Promise<BirthProposalRow[]> {
    const r = await db.query<BirthProposalRow>(
      `SELECT bp.id, bp.proposer_character_id, pr.full_name AS proposer_name,
              bp.partner_character_id, pa.full_name AS partner_name,
              bp.status, bp.created_at, bp.responded_at
       FROM birth_proposals bp
       JOIN characters pr ON pr.id = bp.proposer_character_id
       JOIN characters pa ON pa.id = bp.partner_character_id
       WHERE (bp.proposer_character_id = $1 OR bp.partner_character_id = $1)
         AND bp.status IN ('pending')
       ORDER BY bp.created_at DESC`,
      [characterId],
    );
    return r.rows;
  }

  async getPendingBirthProposalBetween(a: string, b: string, db: Db = this.db): Promise<{ id: string } | null> {
    const r = await db.query<{ id: string }>(
      `SELECT id FROM birth_proposals
       WHERE status = 'pending'
         AND ((proposer_character_id = $1 AND partner_character_id = $2) OR (proposer_character_id = $2 AND partner_character_id = $1))
       LIMIT 1`,
      [a, b],
    );
    return r.rows[0] ?? null;
  }

  async createBirthProposal(client: PoolClient, proposerId: string, partnerId: string): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO birth_proposals (id, proposer_character_id, partner_character_id, status)
       VALUES (gen_random_uuid(), $1, $2, 'pending') RETURNING id`,
      [proposerId, partnerId],
    );
    return r.rows[0]!.id;
  }

  async getBirthProposal(id: string, db: Db = this.db): Promise<BirthProposalRow | null> {
    const r = await db.query<BirthProposalRow>(
      `SELECT bp.id, bp.proposer_character_id, pr.full_name AS proposer_name,
              bp.partner_character_id, pa.full_name AS partner_name,
              bp.status, bp.created_at, bp.responded_at
       FROM birth_proposals bp
       JOIN characters pr ON pr.id = bp.proposer_character_id
       JOIN characters pa ON pa.id = bp.partner_character_id
       WHERE bp.id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async setBirthProposalStatus(client: PoolClient, id: string, status: string): Promise<void> {
    await client.query(
      `UPDATE birth_proposals SET status = $2, responded_at = now() WHERE id = $1`,
      [id, status],
    );
  }

  async hasActivePregnancyForCouple(a: string, b: string, db: Db = this.db): Promise<boolean> {
    const r = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM pregnancies
         WHERE status = 'active'
           AND ((pregnant_character_id = $1 AND other_parent_character_id = $2)
             OR (pregnant_character_id = $2 AND other_parent_character_id = $1))
       ) AS exists`,
      [a, b],
    );
    return r.rows[0]?.exists ?? false;
  }

  async getLastBirthInfo(characterId: string, db: Db = this.db): Promise<{ last_birth_game_year: number | null; last_birth_game_day: number | null }> {
    const r = await db.query<{ last_birth_game_year: number | null; last_birth_game_day: number | null }>(
      `SELECT last_birth_game_year, last_birth_game_day FROM characters WHERE id = $1`,
      [characterId],
    );
    return r.rows[0] ?? { last_birth_game_year: null, last_birth_game_day: null };
  }

  async createPregnancy(client: PoolClient, input: {
    pregnantId: string;
    otherParentId: string;
    proposerId: string;
    partnerId: string;
    startYear: number;
    startDay: number;
    dueYear: number;
    dueDay: number;
  }): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO pregnancies
        (id, pregnant_character_id, other_parent_character_id, proposer_character_id, partner_character_id,
         status, start_game_year, start_game_day, due_game_year, due_game_day)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,'active',$5,$6,$7,$8)
       RETURNING id`,
      [input.pregnantId, input.otherParentId, input.proposerId, input.partnerId, input.startYear, input.startDay, input.dueYear, input.dueDay],
    );
    return r.rows[0]!.id;
  }

  async markParentsLastBirth(client: PoolClient, a: string, b: string, year: number, day: number): Promise<void> {
    await client.query(
      `UPDATE characters SET last_birth_game_year = $2, last_birth_game_day = $3 WHERE id = $1`,
      [a, year, day],
    );
    await client.query(
      `UPDATE characters SET last_birth_game_year = $2, last_birth_game_day = $3 WHERE id = $1`,
      [b, year, day],
    );
  }

  async hasValidResidence(characterId: string, db: Db = this.db): Promise<boolean> {
    // Sở hữu nhà ở hợp lệ: core properties (apartment/house) hoặc province land (house/apartment/mini_apartment)
    const owned = await db.query<{ ok: boolean }>(
      `SELECT (
         EXISTS (
           SELECT 1 FROM properties p
           WHERE p.owner_character_id = $1
             AND p.status IN ('owned','listed')
             AND p.property_type IN ('apartment','house')
         )
         OR EXISTS (
           SELECT 1 FROM province_land_properties pl
           WHERE pl.owner_character_id = $1
             AND pl.status = 'owned'
             AND COALESCE(pl.merged_into_property_id::text,'') = ''
             AND pl.property_type IN ('apartment','house','mini_apartment')
         )
       ) AS ok`,
      [characterId],
    );
    if (owned.rows[0]?.ok) return true;

    // Thuê nhà ở hợp lệ: lease active trên core property loại nhà ở
    const rented = await db.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM leases l
         JOIN properties p ON p.id = l.property_id
         WHERE l.tenant_character_id = $1
           AND l.status = 'active'
           AND p.property_type IN ('apartment','house')
       ) AS ok`,
      [characterId],
    );
    return rented.rows[0]?.ok ?? false;
  }

  async listAdoptableChildren(db: Db = this.db): Promise<AdoptableChildRow[]> {
    const r = await db.query<AdoptableChildRow>(
      `SELECT c.id, c.full_name, c.age, c.wellbeing
       FROM characters c
       WHERE COALESCE(c.is_dependent,false) = true
         AND c.parent_1_id IS NULL AND c.parent_2_id IS NULL
         AND c.custodial_parent_id IS NULL
         AND COALESCE(c.dependent_status,'infant') IN ('infant','child')
         AND COALESCE(c.is_alive,true) = true
         AND c.age < 18
         AND NOT EXISTS (
           SELECT 1 FROM adoption_applications aa
           WHERE aa.child_character_id = c.id AND aa.status IN ('pending_spouse_approval','pending_review','completed')
         )
       ORDER BY c.age ASC, c.created_at ASC
       LIMIT 20`,
    );
    return r.rows;
  }

  async createNpcAdoptableChild(client: PoolClient, input: {
    fullName: string;
    age: number;
    wellbeing: number;
    birthplace: string;
    cccd: string;
    accountNumber: string;
    birthGameYear: number;
    birthGameDay: number;
  }): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO characters
        (id, user_id, full_name, account_number, cccd, birthplace, age, health_energy, cash_minor,
         credit_score, heat_level, is_alive, marital_status, location_x, location_y,
         birth_game_year, birth_game_day, death_age,
         is_dependent, wellbeing, care_tier, is_adopted, dependent_status)
       VALUES (gen_random_uuid(), NULL, $1, $2, $3, $4, $5, 100, 0, 650, 0, true, 'single', 0, 0,
               $6, $7, 80, true, $8, 'standard', false, 'child')
       RETURNING id`,
      [
        input.fullName, input.accountNumber, input.cccd, input.birthplace, input.age,
        input.birthGameYear, input.birthGameDay, input.wellbeing,
      ],
    );
    return r.rows[0]!.id;
  }

  async getAdoptionApplication(id: string, db: Db = this.db): Promise<AdoptionApplicationRow | null> {
    const r = await db.query<AdoptionApplicationRow>(
      `SELECT aa.id, aa.applicant_character_id, ap.full_name AS applicant_name,
              aa.spouse_character_id, sp.full_name AS spouse_name,
              aa.child_character_id, ch.full_name AS child_name,
              aa.status, aa.applied_game_year, aa.applied_game_day,
              aa.review_complete_game_year, aa.review_complete_game_day,
              aa.spouse_approved, aa.created_at, aa.completed_at
       FROM adoption_applications aa
       JOIN characters ap ON ap.id = aa.applicant_character_id
       LEFT JOIN characters sp ON sp.id = aa.spouse_character_id
       JOIN characters ch ON ch.id = aa.child_character_id
       WHERE aa.id = $1`,
      [id],
    );
    return r.rows[0] ?? null;
  }

  async listAdoptionApplicationsForCharacter(characterId: string, db: Db = this.db): Promise<AdoptionApplicationRow[]> {
    const r = await db.query<AdoptionApplicationRow>(
      `SELECT aa.id, aa.applicant_character_id, ap.full_name AS applicant_name,
              aa.spouse_character_id, sp.full_name AS spouse_name,
              aa.child_character_id, ch.full_name AS child_name,
              aa.status, aa.applied_game_year, aa.applied_game_day,
              aa.review_complete_game_year, aa.review_complete_game_day,
              aa.spouse_approved, aa.created_at, aa.completed_at
       FROM adoption_applications aa
       JOIN characters ap ON ap.id = aa.applicant_character_id
       LEFT JOIN characters sp ON sp.id = aa.spouse_character_id
       JOIN characters ch ON ch.id = aa.child_character_id
       WHERE (aa.applicant_character_id = $1 OR aa.spouse_character_id = $1)
         AND aa.status IN ('pending_spouse_approval','pending_review','completed')
       ORDER BY aa.created_at DESC`,
      [characterId],
    );
    return r.rows;
  }

  async hasPendingAdoptionForChild(childId: string, db: Db = this.db): Promise<boolean> {
    const r = await db.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM adoption_applications
         WHERE child_character_id = $1 AND status IN ('pending_spouse_approval','pending_review','completed')
       ) AS exists`,
      [childId],
    );
    return r.rows[0]?.exists ?? false;
  }

  async createAdoptionApplication(client: PoolClient, input: {
    applicantId: string;
    spouseId: string | null;
    childId: string;
    status: string;
    appliedYear: number;
    appliedDay: number;
    completeYear: number;
    completeDay: number;
    spouseApproved: boolean | null;
  }): Promise<string> {
    const r = await client.query<{ id: string }>(
      `INSERT INTO adoption_applications
        (id, applicant_character_id, spouse_character_id, child_character_id, status,
         applied_game_year, applied_game_day, review_complete_game_year, review_complete_game_day, spouse_approved)
       VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [input.applicantId, input.spouseId, input.childId, input.status, input.appliedYear, input.appliedDay, input.completeYear, input.completeDay, input.spouseApproved],
    );
    return r.rows[0]!.id;
  }

  async setAdoptionStatus(client: PoolClient, id: string, status: string, fields?: { spouseApproved?: boolean | null }): Promise<void> {
    if (fields && 'spouseApproved' in fields) {
      await client.query(
        `UPDATE adoption_applications SET status = $2, spouse_approved = $3, updated_at = now() WHERE id = $1`,
        [id, status, fields.spouseApproved ?? null],
      );
    } else {
      await client.query(
        `UPDATE adoption_applications SET status = $2, updated_at = now() WHERE id = $1`,
        [id, status],
      );
    }
  }
}

export const familyRepository = new FamilyRepository();
