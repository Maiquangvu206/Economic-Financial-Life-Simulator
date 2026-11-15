import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface CompanyRow {
  id: string;
  name: string;
  industry: string;
  ownerCharacterId: string;
  ownerName: string;
  cashMinor: string;
  valuationMinor: string;
  status: string;
  tickerSymbol: string | null;
  foundedAt: Date;
  updatedAt: Date;
  premisesType: string | null;
  premisesProvinceCode: string | null;
  premisesCorePropertyId: string | null;
  premisesProvinceLandPropertyId: string | null;
  premisesCompanyPropertyId: string | null;
  premisesLabel: string | null;
  premisesHostCompanyId: string | null;
  premisesHostCompanyName: string | null;
}

export interface CompanyEmployeeRow {
  employmentId: string;
  characterId: string;
  characterName: string;
  jobTitle: string;
  salaryMinor: string;
  status: 'active' | 'resigned' | 'fired';
  hiredAt: Date;
}

interface CreateCompanyInput {
  name: string;
  industry: string;
  ownerCharacterId: string;
  initialCapitalMinor: number;
  premises: {
    type: 'land_core' | 'land_province' | 'company_property';
    provinceCode: string | null;
    corePropertyId: string | null;
    provinceLandPropertyId: string | null;
    companyPropertyId: string | null;
  };
}

export interface PremisesOptionRow {
  type: 'land_core' | 'land_province' | 'company_property';
  id: string;
  label: string;
  provinceCode: string | null;
  provinceName: string | null;
  propertyType: string | null;
  x: number | null;
  y: number | null;
  hostCompanyId: string | null;
  hostCompanyName: string | null;
}

interface InvestCompanyInput {
  companyId: string;
  investorCharacterId: string;
  amountMinor: number;
}

interface IpoCompanyInput {
  companyId: string;
  tickerSymbol: string;
  initialPriceMinor: number;
  totalShares: number;
}

interface PayDividendInput {
  companyId: string;
  amountPerShareMinor: number;
}

/** Truy cập bảng companies và company_shareholders (doanh nghiệp). */
export class CorporationRepository {
  constructor(readonly db: Db = pool) {}

  private static readonly COMPANY_SELECT = `
    SELECT c.id, c.name, c.industry, c.owner_character_id AS "ownerCharacterId",
           ch.full_name AS "ownerName", c.cash_minor AS "cashMinor",
           c.valuation_minor AS "valuationMinor", c.status, c.ticker_symbol AS "tickerSymbol",
           c.founded_at AS "foundedAt", c.updated_at AS "updatedAt",
           c.premises_type AS "premisesType",
           c.premises_province_code AS "premisesProvinceCode",
           c.premises_core_property_id AS "premisesCorePropertyId",
           c.premises_province_land_property_id AS "premisesProvinceLandPropertyId",
           c.premises_company_property_id AS "premisesCompanyPropertyId",
           CASE
             WHEN c.premises_type = 'land_core' THEN COALESCE('Đất nền (Hà Nội) - ' || COALESCE(cp.lot_number, cp.id::text), 'Đất nền (Hà Nội)')
             WHEN c.premises_type = 'land_province' THEN COALESCE('Đất nền ' || COALESCE(pr.name, c.premises_province_code, '') || ' - ' || plp.node_name, 'Đất nền tỉnh/thành')
             WHEN c.premises_type = 'company_property' THEN COALESCE('Trụ sở tại ' || host.name || ' - ' || COALESCE(hp.lot_number, hp.property_type, 'BĐS'), 'BĐS công ty khác')
             ELSE NULL
           END AS "premisesLabel",
           hp.owner_company_id AS "premisesHostCompanyId",
           host.name AS "premisesHostCompanyName"
    FROM companies c
    JOIN characters ch ON ch.id = c.owner_character_id
    LEFT JOIN properties cp ON cp.id = c.premises_core_property_id
    LEFT JOIN province_land_properties plp ON plp.id = c.premises_province_land_property_id
    LEFT JOIN provinces pr ON pr.code = c.premises_province_code
    LEFT JOIN properties hp ON hp.id = c.premises_company_property_id
    LEFT JOIN companies host ON host.id = hp.owner_company_id
  `;

  /** Danh sách công ty đang hoạt động/IPO (không bao gồm đã giải thể/phá sản), kèm chủ sở hữu và mã chứng khoán (nếu có). */
  async listCompanies(): Promise<CompanyRow[]> {
    const result = await this.db.query<CompanyRow>(
      `${CorporationRepository.COMPANY_SELECT}
       WHERE c.status <> 'bankrupt'
       ORDER BY c.updated_at DESC`,
    );
    return result.rows;
  }

  async getCompany(id: string, db: Db = this.db): Promise<CompanyRow | null> {
    const result = await db.query<CompanyRow>(
      `${CorporationRepository.COMPANY_SELECT}
       WHERE c.id = $1 AND c.status <> 'bankrupt'`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Lấy công ty bất kể trạng thái (phục vụ luồng nội bộ sau giải thể/phá sản). */
  async getCompanyAnyStatus(id: string, db: Db = this.db): Promise<CompanyRow | null> {
    const result = await db.query<CompanyRow>(
      `${CorporationRepository.COMPANY_SELECT}
       WHERE c.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Danh sách cổ đông của một công ty. */
  async listShareholders(companyId: string): Promise<
    {
      characterId: string;
      characterName: string;
      shares: number;
    }[]
  > {
    const result = await this.db.query(
      `SELECT s.holder_character_id AS "characterId", ch.full_name AS "characterName",
              s.shares
       FROM company_shareholders s
       JOIN characters ch ON ch.id = s.holder_character_id
       WHERE s.company_id = $1
       ORDER BY s.shares DESC`,
      [companyId],
    );
    return result.rows;
  }

  /** Thành lập một công ty mới. */
  async createCompany(db: Db, input: CreateCompanyInput): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO companies (
         id, name, industry, owner_character_id, cash_minor, valuation_minor, status, ticker_symbol,
         premises_type, premises_province_code, premises_core_property_id, premises_province_land_property_id, premises_company_property_id
       )
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, 'active', NULL, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.name,
        input.industry,
        input.ownerCharacterId,
        input.initialCapitalMinor,
        input.premises.type,
        input.premises.provinceCode,
        input.premises.corePropertyId,
        input.premises.provinceLandPropertyId,
        input.premises.companyPropertyId,
      ],
    );
    return result.rows[0]!.id;
  }

  async listPremisesOptions(characterId: string, db: Db = this.db): Promise<PremisesOptionRow[]> {
    const coreLand = await db.query<PremisesOptionRow>(
      `SELECT 'land_core'::text AS type,
              p.id,
              ('Đất nền (Hà Nội) - ' || COALESCE(p.lot_number, p.id::text)
                || CASE WHEN n.name IS NOT NULL AND n.name <> '' THEN ' - ' || n.name ELSE '' END
                || CASE WHEN n.x IS NOT NULL AND n.y IS NOT NULL THEN ' [' || n.x || ',' || n.y || ']' ELSE '' END) AS label,
              '001'::text AS "provinceCode",
              'Thành phố Hà Nội'::text AS "provinceName",
              p.property_type AS "propertyType",
              n.x, n.y,
              NULL::uuid AS "hostCompanyId",
              NULL::text AS "hostCompanyName"
       FROM properties p
       LEFT JOIN map_nodes n ON n.id = p.node_id
       WHERE p.owner_character_id = $1
         AND p.status = 'owned'
         AND p.property_type = 'land'
         AND p.hq_company_id IS NULL
         AND p.merged_into_property_id IS NULL
         AND (COALESCE(NULLIF(TRIM(p.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(p.construction_option)) = 'none')
       ORDER BY p.updated_at DESC NULLS LAST, p.id`,
      [characterId],
    );

    const provinceLand = await db.query<PremisesOptionRow>(
      `SELECT 'land_province'::text AS type,
              plp.id,
              ('Đất nền - ' || COALESCE(pr.name, plp.province_code) || ' - ' || plp.node_name || ' [' || plp.node_x || ',' || plp.node_y || ']') AS label,
              plp.province_code AS "provinceCode",
              pr.name AS "provinceName",
              plp.property_type AS "propertyType",
              plp.node_x AS x,
              plp.node_y AS y,
              NULL::uuid AS "hostCompanyId",
              NULL::text AS "hostCompanyName"
       FROM province_land_properties plp
       LEFT JOIN provinces pr ON pr.code = plp.province_code
       WHERE plp.owner_character_id = $1
         AND plp.status = 'owned'
         AND plp.property_type = 'land'
         AND plp.hq_company_id IS NULL
         AND plp.merged_into_property_id IS NULL
         AND (COALESCE(NULLIF(TRIM(plp.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(plp.construction_option)) = 'none')
       ORDER BY pr.name NULLS LAST, plp.updated_at DESC, plp.id`,
      [characterId],
    );

    const companyProps = await db.query<PremisesOptionRow>(
      `SELECT 'company_property'::text AS type,
              p.id,
              ('Trụ sở tại ' || c.name || ' - ' || COALESCE(n.name, p.lot_number, p.property_type, p.id::text) || CASE WHEN n.x IS NOT NULL AND n.y IS NOT NULL THEN ' [' || n.x || ',' || n.y || ']' ELSE '' END) AS label,
              NULL::text AS "provinceCode",
              NULL::text AS "provinceName",
              p.property_type AS "propertyType",
              n.x, n.y,
              c.id AS "hostCompanyId",
              c.name AS "hostCompanyName"
       FROM properties p
       JOIN companies c ON c.id = p.owner_company_id
       LEFT JOIN map_nodes n ON n.id = p.node_id
       WHERE p.owner_company_id IS NOT NULL
         AND c.status <> 'bankrupt'
         AND p.property_type <> 'land'
         AND p.status IN ('owned', 'listed')
         AND p.merged_into_property_id IS NULL
         AND COALESCE(NULLIF(TRIM(p.construction_option), ''), NULL) IS NOT NULL
       ORDER BY c.name ASC, p.updated_at DESC NULLS LAST, p.id`,
      [characterId],
    );

    return [...coreLand.rows, ...provinceLand.rows, ...companyProps.rows];
  }

  async lockAndClaimCoreLandPremises(db: Db, propertyId: string, characterId: string, companyId: string): Promise<{ provinceCode: string | null }> {
    const r = await db.query<{ id: string }>(
      `UPDATE properties p
       SET hq_company_id = $3, updated_at = now()
       WHERE p.id = $1
         AND p.owner_character_id = $2
         AND p.status = 'owned'
         AND p.property_type = 'land'
         AND p.hq_company_id IS NULL
         AND p.merged_into_property_id IS NULL
         AND (COALESCE(NULLIF(TRIM(p.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(p.construction_option)) = 'none')
       RETURNING p.id`,
      [propertyId, characterId, companyId],
    );
    if (!r.rows[0]) throw new Error('CORE_LAND_PREMISES_UNAVAILABLE');
    return { provinceCode: '001' };
  }

  async lockAndClaimProvinceLandPremises(db: Db, propertyId: string, characterId: string, companyId: string): Promise<{ provinceCode: string | null }> {
    const r = await db.query<{ id: string; provinceCode: string }>(
      `UPDATE province_land_properties plp
       SET hq_company_id = $3, updated_at = now()
       WHERE plp.id = $1
         AND plp.owner_character_id = $2
         AND plp.status = 'owned'
         AND plp.property_type = 'land'
         AND plp.hq_company_id IS NULL
         AND plp.merged_into_property_id IS NULL
         AND (COALESCE(NULLIF(TRIM(plp.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(plp.construction_option)) = 'none')
       RETURNING plp.id, plp.province_code AS "provinceCode"`,
      [propertyId, characterId, companyId],
    );
    const row = r.rows[0];
    if (!row) throw new Error('PROVINCE_LAND_PREMISES_UNAVAILABLE');
    return { provinceCode: row.provinceCode };
  }

  async validateCompanyPropertyPremises(db: Db, propertyId: string): Promise<{ hostCompanyId: string; hostCompanyName: string }> {
    const r = await db.query<{ id: string; hostCompanyId: string; hostCompanyName: string }>(
      `SELECT p.id, c.id AS "hostCompanyId", c.name AS "hostCompanyName"
       FROM properties p
       JOIN companies c ON c.id = p.owner_company_id
       WHERE p.id = $1
         AND p.owner_company_id IS NOT NULL
         AND c.status <> 'bankrupt'
         AND p.property_type <> 'land'
         AND p.status IN ('owned', 'listed')
         AND p.merged_into_property_id IS NULL
         AND COALESCE(NULLIF(TRIM(p.construction_option), ''), NULL) IS NOT NULL
       FOR UPDATE OF p`,
      [propertyId],
    );
    const row = r.rows[0];
    if (!row) throw new Error('COMPANY_PROPERTY_PREMISES_UNAVAILABLE');
    return { hostCompanyId: row.hostCompanyId, hostCompanyName: row.hostCompanyName };
  }

  /** Đảm bảo công ty có giấy phép kinh doanh hoạt động (idempotent). */
  async ensureBusinessLicense(db: Db, companyId: string, licenseType = 'Giấy phép kinh doanh'): Promise<void> {
    await db.query(
      `INSERT INTO business_licenses (company_id, license_type, status)
       SELECT $1::uuid, $2, 'active'
       WHERE NOT EXISTS (
         SELECT 1 FROM business_licenses
         WHERE company_id = $1::uuid AND status IN ('active','suspended')
       )`,
      [companyId, licenseType],
    );
  }

  /** Đầu tư vốn vào công ty (tăng cash và valuation). */
  async investCompany(db: Db, input: InvestCompanyInput): Promise<void> {
    await db.query(
      `UPDATE companies
       SET cash_minor = cash_minor + $2::bigint, valuation_minor = valuation_minor + $2::bigint,
           updated_at = now()
       WHERE id = $1::uuid`,
      [input.companyId, input.amountMinor],
    );
  }

  /** Kiểm tra xem nhân vật có phải chủ sở hữu công ty không. */
  async isOwner(db: Db, companyId: string, characterId: string): Promise<boolean> {
    const result = await db.query<{ exists: string }>(
      `SELECT count(*) AS exists FROM companies WHERE id = $1::uuid AND owner_character_id = $2::uuid`,
      [companyId, characterId],
    );
    return Number(result.rows[0]?.exists ?? 0) > 0;
  }

  /** Chuyển công ty sang IPO: tạo mã chứng khoán, gán status 'ipo', cấp cổ phiếu ban đầu cho chủ sở hữu. */
  async ipoCompany(db: Db, input: IpoCompanyInput): Promise<void> {
    await db.query(
      `UPDATE companies
       SET status = 'ipo', ticker_symbol = $2, updated_at = now()
       WHERE id = $1::uuid AND status = 'active'`,
      [input.companyId, input.tickerSymbol],
    );
    await db.query(
      `INSERT INTO stock_tickers (id, company_id, symbol, current_price_minor, previous_close_minor, total_volume, is_ipo)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3::bigint, $3::bigint, 0, true)
       ON CONFLICT (company_id) DO UPDATE
       SET symbol = EXCLUDED.symbol,
           current_price_minor = EXCLUDED.current_price_minor,
           previous_close_minor = EXCLUDED.previous_close_minor,
           is_ipo = true`,
      [input.companyId, input.tickerSymbol, input.initialPriceMinor],
    );
    // Cấp 100% cổ phiếu ban đầu cho chủ sở hữu.
    const company = await this.getCompany(input.companyId, db);
    if (!company) throw new Error('Company not found');
    await db.query(
      `INSERT INTO company_shareholders (id, company_id, holder_character_id, shares)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::bigint)
       ON CONFLICT (company_id, holder_character_id) DO UPDATE
       SET shares = EXCLUDED.shares`,
      [input.companyId, company.ownerCharacterId, input.totalShares],
    );
  }

  /** Phát hành cổ tức: trừ tiền từ công ty, phân chia đều theo số cổ phiếu mỗi cổ đông. */
  async payDividend(
    db: Db,
    input: PayDividendInput,
  ): Promise<{ totalDistributedMinor: number; recipientCount: number }> {
    const shareholders = await db.query<{ holder_character_id: string; shares: string }>(
      `SELECT holder_character_id, shares FROM company_shareholders WHERE company_id = $1::uuid AND shares > 0`,
      [input.companyId],
    );
    if (shareholders.rows.length === 0) {
      return { totalDistributedMinor: 0, recipientCount: 0 };
    }
    const company = await this.getCompany(input.companyId, db);
    if (!company) throw new Error('Company not found');
    const companyCash = Number(company.cashMinor);
    const totalShares = shareholders.rows.reduce((sum, s) => sum + Number(s.shares), 0);
    if (totalShares <= 0) return { totalDistributedMinor: 0, recipientCount: 0 };

    let totalDistributed = 0;
    for (const s of shareholders.rows) {
      const shares = Number(s.shares);
      const amountMinor = Math.floor(
        (shares / totalShares) * input.amountPerShareMinor * totalShares,
      );
      // Giới hạn không quá tiền công ty có.
      if (companyCash - totalDistributed < amountMinor) continue;
      await db.query(
        `UPDATE companies SET cash_minor = cash_minor - $2::bigint, updated_at = now() WHERE id = $1::uuid`,
        [input.companyId, amountMinor],
      );
      await db.query(
        `UPDATE ledger_accounts SET balance_minor = balance_minor + $2::bigint, updated_at = now()
         WHERE owner_type = 'character' AND owner_id = $1::uuid AND kind = 'cash' AND currency = 'VND'`,
        [s.holder_character_id, amountMinor],
      );
      totalDistributed += amountMinor;
    }
    return { totalDistributedMinor: totalDistributed, recipientCount: shareholders.rows.length };
  }

  /** Chuyển chủ sở hữu công ty (dùng khi khiêu kích thác đoá >51%). */
  async transferOwnership(db: Db, companyId: string, newOwnerCharacterId: string): Promise<void> {
    await db.query(
      `UPDATE companies SET owner_character_id = $2::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      [companyId, newOwnerCharacterId],
    );
  }

  async listEmployees(companyId: string, db: Db = this.db): Promise<CompanyEmployeeRow[]> {
    const result = await db.query<CompanyEmployeeRow>(
      `SELECT e.id AS "employmentId", e.character_id AS "characterId",
              ch.full_name AS "characterName", j.title AS "jobTitle",
              e.salary_minor AS "salaryMinor", e.status, e.hired_at AS "hiredAt"
       FROM employments e
       JOIN characters ch ON ch.id = e.character_id
       JOIN jobs j ON j.id = e.job_id
       WHERE e.company_id = $1
       ORDER BY e.hired_at DESC`,
      [companyId],
    );
    return result.rows;
  }

  async fireEmployee(db: Db, companyId: string, employmentId: string): Promise<boolean> {
    const result = await db.query<{ id: string }>(
      `UPDATE employments
       SET status = 'fired', ended_at = now()
       WHERE id = $1 AND company_id = $2 AND status = 'active'
       RETURNING id`,
      [employmentId, companyId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async setBankrupt(db: Db, companyId: string): Promise<void> {
    await db.query(`UPDATE companies SET status = 'bankrupt', updated_at = now() WHERE id = $1`, [
      companyId,
    ]);
  }

  async adjustCash(db: Db, companyId: string, deltaMinor: number): Promise<string> {
    const result = await db.query<{ cash_minor: string }>(
      `UPDATE companies
       SET cash_minor = GREATEST(0, cash_minor + $2::bigint), updated_at = now()
       WHERE id = $1
       RETURNING cash_minor`,
      [companyId, deltaMinor],
    );
    return result.rows[0]?.cash_minor ?? '0';
  }

  // --- HR: kế hoạch tuyển dụng AI + nhân sự NPC ---
  async createHiringPlan(
    db: Db,
    input: {
      companyId: string;
      requestedBy: string;
      roleFocus: string;
      headcount: number;
      rationale: string;
      aiModel: string | null;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_hiring_plans (company_id, requested_by, role_focus, headcount, rationale, ai_model)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        input.companyId,
        input.requestedBy,
        input.roleFocus,
        input.headcount,
        input.rationale,
        input.aiModel,
      ],
    );
    return r.rows[0]!.id;
  }

  async addHiringCandidate(
    db: Db,
    input: {
      planId: string;
      fullName: string;
      roleTitle: string;
      seniority: string;
      salaryMinor: number;
      fitScore: number;
      riskNote: string;
      reason: string;
    },
  ): Promise<void> {
    await db.query(
      `INSERT INTO company_hiring_candidates
         (plan_id, full_name, role_title, seniority, proposed_salary_minor, fit_score, risk_note, ai_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        input.planId,
        input.fullName,
        input.roleTitle,
        input.seniority,
        input.salaryMinor,
        input.fitScore,
        input.riskNote,
        input.reason,
      ],
    );
  }

  async listHiringPlans(companyId: string, db: Db = this.db): Promise<any[]> {
    const plans = await db.query(
      `SELECT id, company_id AS "companyId", status, role_focus AS "roleFocus",
              headcount, rationale, ai_model AS "aiModel",
              created_at AS "createdAt", decided_at AS "decidedAt", applied_at AS "appliedAt"
       FROM company_hiring_plans WHERE company_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [companyId],
    );
    const ids = plans.rows.map((p) => p.id);
    let candidates: any[] = [];
    if (ids.length > 0) {
      const c = await db.query(
        `SELECT id, plan_id AS "planId", full_name AS "fullName", role_title AS "roleTitle",
                seniority, proposed_salary_minor AS "proposedSalaryMinor",
                fit_score AS "fitScore", risk_note AS "riskNote", ai_reason AS "aiReason", status
         FROM company_hiring_candidates WHERE plan_id = ANY($1::uuid[]) ORDER BY fit_score DESC`,
        [ids],
      );
      candidates = c.rows;
    }
    return plans.rows.map((p) => ({
      ...p,
      candidates: candidates.filter((c) => c.planId === p.id),
    }));
  }

  async getHiringPlan(planId: string, db: Db = this.db): Promise<any | null> {
    const plan = await db.query(
      `SELECT id, company_id AS "companyId", requested_by AS "requestedBy", status,
              role_focus AS "roleFocus", headcount, rationale, ai_model AS "aiModel",
              created_at AS "createdAt", decided_at AS "decidedAt", applied_at AS "appliedAt"
       FROM company_hiring_plans WHERE id = $1`,
      [planId],
    );
    if (!plan.rows[0]) return null;
    const c = await db.query(
      `SELECT id, plan_id AS "planId", full_name AS "fullName", role_title AS "roleTitle",
              seniority, proposed_salary_minor AS "proposedSalaryMinor",
              fit_score AS "fitScore", risk_note AS "riskNote", ai_reason AS "aiReason", status
       FROM company_hiring_candidates WHERE plan_id = $1 ORDER BY fit_score DESC`,
      [planId],
    );
    return { ...plan.rows[0], candidates: c.rows };
  }

  async decideHiringCandidate(
    db: Db,
    planId: string,
    candidateId: string,
    decision: 'approved' | 'rejected',
  ): Promise<boolean> {
    const r = await db.query(
      `UPDATE company_hiring_candidates SET status = $3
       WHERE id = $2 AND plan_id = $1 AND status IN ('proposed','approved','rejected')
       RETURNING id`,
      [planId, candidateId, decision],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async applyHiringPlan(db: Db, planId: string): Promise<number> {
    const approved = await db.query<{
      id: string;
      fullName: string;
      roleTitle: string;
      proposedSalaryMinor: string;
    }>(
      `SELECT id, full_name AS "fullName", role_title AS "roleTitle",
              proposed_salary_minor AS "proposedSalaryMinor"
       FROM company_hiring_candidates
       WHERE plan_id = $1 AND status = 'approved'`,
      [planId],
    );
    const plan = await db.query<{ companyId: string }>(
      `SELECT company_id AS "companyId" FROM company_hiring_plans WHERE id = $1`,
      [planId],
    );
    const companyId = plan.rows[0]?.companyId;
    if (!companyId) return 0;
    let hired = 0;
    for (const c of approved.rows) {
      await db.query(
        `INSERT INTO company_staff (company_id, candidate_id, full_name, role_title, salary_minor, status)
         VALUES ($1,$2,$3,$4,$5,'active')`,
        [companyId, c.id, c.fullName, c.roleTitle, Number(c.proposedSalaryMinor)],
      );
      await db.query(`UPDATE company_hiring_candidates SET status = 'hired' WHERE id = $1`, [c.id]);
      hired++;
    }
    await db.query(
      `UPDATE company_hiring_plans SET status = 'applied', applied_at = now(), decided_at = COALESCE(decided_at, now()) WHERE id = $1`,
      [planId],
    );
    return hired;
  }

  async listCompanyStaff(companyId: string, db: Db = this.db): Promise<any[]> {
    const r = await db.query(
      `SELECT id, full_name AS "fullName", role_title AS "roleTitle",
              salary_minor AS "salaryMinor", status, hired_at AS "hiredAt", fired_at AS "firedAt"
       FROM company_staff WHERE company_id = $1 ORDER BY hired_at DESC`,
      [companyId],
    );
    return r.rows;
  }

  async fireStaff(db: Db, companyId: string, staffId: string): Promise<boolean> {
    const r = await db.query(
      `UPDATE company_staff SET status = 'fired', fired_at = now()
       WHERE id = $1 AND company_id = $2 AND status = 'active' RETURNING id`,
      [staffId, companyId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  // --- Sổ cái/kế toán + khai thuế ---
  async addLedgerEntry(
    db: Db,
    input: {
      companyId: string;
      entryType: string;
      amountMinor: number;
      declaredAmountMinor: number;
      description: string;
      isEvasion: boolean;
      meta?: Record<string, unknown>;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_ledger_entries
         (company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
      [
        input.companyId,
        input.entryType,
        input.amountMinor,
        input.declaredAmountMinor,
        input.description,
        input.isEvasion,
        JSON.stringify(input.meta ?? {}),
      ],
    );
    return r.rows[0]!.id;
  }

  async listLedgerEntries(companyId: string, limit = 100, db: Db = this.db): Promise<any[]> {
    const r = await db.query(
      `SELECT id, company_id AS "companyId", entry_type AS "entryType",
              amount_minor AS "amountMinor", declared_amount_minor AS "declaredAmountMinor",
              description, is_evasion AS "isEvasion", occurred_at AS "occurredAt"
       FROM company_ledger_entries WHERE company_id = $1
       ORDER BY occurred_at DESC LIMIT $2`,
      [companyId, limit],
    );
    return r.rows;
  }

  async ledgerTotals(companyId: string, db: Db = this.db): Promise<any> {
    const r = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'revenue' THEN amount_minor ELSE 0 END),0)::bigint AS revenue,
         COALESCE(SUM(CASE WHEN entry_type IN ('opex','payroll','tax','fine','bribe','other') THEN amount_minor ELSE 0 END),0)::bigint AS expense,
         COALESCE(SUM(CASE WHEN entry_type = 'revenue' THEN declared_amount_minor ELSE 0 END),0)::bigint AS "declaredRevenue",
         COALESCE(SUM(CASE WHEN entry_type IN ('opex','payroll','tax','fine','bribe','other') THEN declared_amount_minor ELSE 0 END),0)::bigint AS "declaredExpense"
       FROM company_ledger_entries WHERE company_id = $1`,
      [companyId],
    );
    const t = r.rows[0] ?? { revenue: 0, expense: 0, declaredRevenue: 0, declaredExpense: 0 };
    const revenue = Number(t.revenue);
    const expense = Number(t.expense);
    const declaredRevenue = Number(t.declaredRevenue);
    const declaredExpense = Number(t.declaredExpense);
    return {
      revenue,
      expense,
      declaredRevenue,
      declaredExpense,
      profit: revenue - expense,
      taxGap: Math.max(0, revenue - declaredRevenue) + Math.max(0, declaredExpense - expense),
    };
  }

  async createTaxFiling(
    db: Db,
    input: {
      companyId: string;
      period: string;
      declaredRevenueMinor: number;
      actualRevenueMinor: number;
      declaredExpenseMinor: number;
      actualExpenseMinor: number;
      taxDueMinor: number;
      riskScore: number;
      notes: string;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_tax_filings
         (company_id, period, declared_revenue_minor, actual_revenue_minor,
          declared_expense_minor, actual_expense_minor, tax_due_minor, risk_score, status, notes, filed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'filed',$9,now()) RETURNING id`,
      [
        input.companyId,
        input.period,
        input.declaredRevenueMinor,
        input.actualRevenueMinor,
        input.declaredExpenseMinor,
        input.actualExpenseMinor,
        input.taxDueMinor,
        input.riskScore,
        input.notes,
      ],
    );
    return r.rows[0]!.id;
  }

  async listTaxFilings(companyId: string, db: Db = this.db): Promise<any[]> {
    const r = await db.query(
      `SELECT id, company_id AS "companyId", period,
              declared_revenue_minor AS "declaredRevenueMinor",
              actual_revenue_minor AS "actualRevenueMinor",
              declared_expense_minor AS "declaredExpenseMinor",
              actual_expense_minor AS "actualExpenseMinor",
              tax_due_minor AS "taxDueMinor", tax_paid_minor AS "taxPaidMinor",
              risk_score AS "riskScore", status, notes,
              created_at AS "createdAt", filed_at AS "filedAt"
       FROM company_tax_filings WHERE company_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [companyId],
    );
    return r.rows;
  }
}

export const corporationRepository = new CorporationRepository();

