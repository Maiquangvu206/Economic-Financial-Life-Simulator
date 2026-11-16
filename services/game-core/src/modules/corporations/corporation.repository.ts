import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';
import { ledger } from '../../shared/ledger/ledger.service.js';

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
  premisesNeedsReselection: boolean;
  premisesInvalidReason: string | null;
  revenueRetainPct: number;
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
           -- Định giá hiệu dụng: gồm quỹ/cash (book base) và blend với vốn hoá thị trường cho công ty IPO
           effective_company_valuation(c.id) AS "valuationMinor", c.status, c.ticker_symbol AS "tickerSymbol",
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
           host.name AS "premisesHostCompanyName",
           COALESCE(c.premises_needs_reselection, false) AS "premisesNeedsReselection",
           c.premises_invalid_reason AS "premisesInvalidReason",
            COALESCE(c.revenue_retain_pct, 0)::float AS "revenueRetainPct"
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
              CASE
                WHEN LOWER(COALESCE(p.construction_option,'')) = 'company_hq'
                  THEN ('Trụ sở công ty đã xây (Hà Nội) - ' || COALESCE(p.construction_label, p.lot_number, p.id::text)
                        || CASE WHEN n.name IS NOT NULL AND n.name <> '' THEN ' - ' || n.name ELSE '' END
                        || CASE WHEN n.x IS NOT NULL AND n.y IS NOT NULL THEN ' [' || n.x || ',' || n.y || ']' ELSE '' END)
                ELSE ('Đất nền (Hà Nội) - ' || COALESCE(p.lot_number, p.id::text)
                      || CASE WHEN n.name IS NOT NULL AND n.name <> '' THEN ' - ' || n.name ELSE '' END
                      || CASE WHEN n.x IS NOT NULL AND n.y IS NOT NULL THEN ' [' || n.x || ',' || n.y || ']' ELSE '' END)
              END AS label,
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
         AND p.hq_company_id IS NULL
         AND p.merged_into_property_id IS NULL
         AND (
           (p.property_type = 'land' AND (COALESCE(NULLIF(TRIM(p.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(p.construction_option)) = 'none'))
           OR LOWER(COALESCE(p.construction_option,'')) = 'company_hq'
         )
       ORDER BY (LOWER(COALESCE(p.construction_option,'')) = 'company_hq') DESC, p.updated_at DESC NULLS LAST, p.id`,
      [characterId],
    );

    const provinceLand = await db.query<PremisesOptionRow>(
      `SELECT 'land_province'::text AS type,
              plp.id,
              CASE
                WHEN LOWER(COALESCE(plp.construction_option,'')) = 'company_hq'
                  THEN ('Trụ sở công ty đã xây - ' || COALESCE(pr.name, plp.province_code) || ' - ' || COALESCE(plp.construction_label, plp.node_name) || ' [' || plp.node_x || ',' || plp.node_y || ']')
                ELSE ('Đất nền - ' || COALESCE(pr.name, plp.province_code) || ' - ' || plp.node_name || ' [' || plp.node_x || ',' || plp.node_y || ']')
              END AS label,
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
         AND plp.hq_company_id IS NULL
         AND plp.merged_into_property_id IS NULL
         AND (
           (plp.property_type = 'land' AND (COALESCE(NULLIF(TRIM(plp.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(plp.construction_option)) = 'none'))
           OR LOWER(COALESCE(plp.construction_option,'')) = 'company_hq'
         )
       ORDER BY (LOWER(COALESCE(plp.construction_option,'')) = 'company_hq') DESC, pr.name NULLS LAST, plp.updated_at DESC, plp.id`,
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
         AND p.hq_company_id IS NULL
         AND p.merged_into_property_id IS NULL
         AND (
           (p.property_type = 'land' AND (COALESCE(NULLIF(TRIM(p.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(p.construction_option)) = 'none'))
           OR LOWER(COALESCE(p.construction_option,'')) = 'company_hq'
         )
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
         AND plp.hq_company_id IS NULL
         AND plp.merged_into_property_id IS NULL
         AND (
           (plp.property_type = 'land' AND (COALESCE(NULLIF(TRIM(plp.construction_option), ''), NULL) IS NULL OR LOWER(TRIM(plp.construction_option)) = 'none'))
           OR LOWER(COALESCE(plp.construction_option,'')) = 'company_hq'
         )
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

  /** Đầu tư/Nạp vốn vào công ty (legacy helper): tăng cash và valuation. */
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
    if (decision === 'rejected') {
      const r = await db.query(
        `DELETE FROM company_hiring_candidates WHERE id = $2 AND plan_id = $1 RETURNING id`,
        [planId, candidateId],
      );
      return (r.rowCount ?? 0) > 0;
    }
    const r = await db.query(
      `UPDATE company_hiring_candidates SET status = 'approved'
       WHERE id = $2 AND plan_id = $1 AND status IN ('proposed','approved')
       RETURNING id`,
      [planId, candidateId],
    );
    return (r.rowCount ?? 0) > 0;
  }

  async deleteHiringPlan(db: Db, planId: string): Promise<void> {
    await db.query(`DELETE FROM company_hiring_plans WHERE id = $1`, [planId]);
  }

  async cleanupEmptyHiringPlan(db: Db, planId: string): Promise<void> {
    const r = await db.query<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM company_hiring_candidates WHERE plan_id = $1`,
      [planId],
    );
    if (Number(r.rows[0]?.c ?? 0) === 0) {
      await this.deleteHiringPlan(db, planId);
    }
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
    // Tuyển dụng thành công: không lưu trữ phiên gợi ý lâu dài (ứng viên còn lại cũng bị xóa cùng kế hoạch)
    if (hired > 0) {
      await db.query(`DELETE FROM company_hiring_plans WHERE id = $1`, [planId]);
    }
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
      ledgerKind?: string;
      periodKey?: string | null;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_ledger_entries
         (company_id, entry_type, amount_minor, declared_amount_minor, description, is_evasion, meta, ledger_kind, period_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING id`,
      [
        input.companyId,
        input.entryType,
        input.amountMinor,
        input.declaredAmountMinor,
        input.description,
        input.isEvasion,
        JSON.stringify(input.meta ?? {}),
        input.ledgerKind ?? 'MANUAL',
        input.periodKey ?? null,
      ],
    );
    return r.rows[0]!.id;
  }

  async listLedgerEntries(companyId: string, limit = 100, db: Db = this.db): Promise<any[]> {
    const r = await db.query(
      `SELECT id, company_id AS "companyId", entry_type AS "entryType",
              amount_minor AS "amountMinor", declared_amount_minor AS "declaredAmountMinor",
              description, is_evasion AS "isEvasion", occurred_at AS "occurredAt",
              ledger_kind AS "ledgerKind", period_key AS "periodKey"
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
      periodKey?: string | null;
      declaredRevenueMinor: number;
      actualRevenueMinor: number;
      declaredExpenseMinor: number;
      actualExpenseMinor: number;
      taxDueMinor: number;
      taxPaidMinor?: number;
      riskScore: number;
      notes: string;
      status?: string;
      dividendPoolMinor?: number;
      dividendDistributedMinor?: number;
      dividendDistributedAt?: Date | null;
      evasionGapMinor?: number;
      opexTotalMinor?: number;
    },
  ): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_tax_filings
         (company_id, period, period_key, declared_revenue_minor, actual_revenue_minor,
          declared_expense_minor, actual_expense_minor, tax_due_minor, tax_paid_minor, risk_score, status, notes, filed_at,
          dividend_pool_minor, dividend_distributed_minor, dividend_distributed_at, evasion_gap_minor, opex_total_minor)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),$13,$14,$15,$16,$17) RETURNING id`,
      [
        input.companyId,
        input.period,
        input.periodKey ?? null,
        input.declaredRevenueMinor,
        input.actualRevenueMinor,
        input.declaredExpenseMinor,
        input.actualExpenseMinor,
        input.taxDueMinor,
        input.taxPaidMinor ?? input.taxDueMinor,
        input.riskScore,
        input.status ?? 'filed',
        input.notes,
        input.dividendPoolMinor ?? 0,
        input.dividendDistributedMinor ?? 0,
        input.dividendDistributedAt ?? null,
        input.evasionGapMinor ?? 0,
        input.opexTotalMinor ?? 0,
      ],
    );
    return r.rows[0]!.id;
  }

  async listTaxFilings(companyId: string, db: Db = this.db): Promise<any[]> {
    const r = await db.query(
      `SELECT id, company_id AS "companyId", period, period_key AS "periodKey",
              declared_revenue_minor AS "declaredRevenueMinor",
              actual_revenue_minor AS "actualRevenueMinor",
              declared_expense_minor AS "declaredExpenseMinor",
              actual_expense_minor AS "actualExpenseMinor",
              tax_due_minor AS "taxDueMinor", tax_paid_minor AS "taxPaidMinor",
              risk_score AS "riskScore", status, notes,
              created_at AS "createdAt", filed_at AS "filedAt",
              dividend_pool_minor AS "dividendPoolMinor",
              dividend_distributed_minor AS "dividendDistributedMinor",
              dividend_distributed_at AS "dividendDistributedAt",
              evasion_gap_minor AS "evasionGapMinor",
              audit_checked_at AS "auditCheckedAt",
              audit_penalty_minor AS "auditPenaltyMinor",
              opex_total_minor AS "opexTotalMinor"
       FROM company_tax_filings WHERE company_id = $1 ORDER BY created_at DESC LIMIT 30`,
      [companyId],
    );
    return r.rows;
  }

  async getSettlementForFiling(
    db: Db,
    companyId: string,
    periodKey?: string | null,
  ): Promise<{ period_key: string; actual_revenue_minor: string; game_year: number; game_month: number } | null> {
    if (periodKey) {
      const r = await db.query(
        `SELECT period_key, actual_revenue_minor, game_year, game_month
         FROM company_revenue_settlements
         WHERE company_id = $1 AND period_key = $2
         LIMIT 1`,
        [companyId, periodKey],
      );
      return r.rows[0] ?? null;
    }
    const r = await db.query(
      `SELECT period_key, actual_revenue_minor, game_year, game_month
       FROM company_revenue_settlements
       WHERE company_id = $1
       ORDER BY game_year DESC, game_month DESC, settled_at DESC
       LIMIT 1`,
      [companyId],
    );
    return r.rows[0] ?? null;
  }

  async sumOpexInPeriod(db: Db, companyId: string, periodKey: string): Promise<number> {
    const r = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_minor),0)::bigint AS total
       FROM company_ledger_entries
       WHERE company_id = $1 AND period_key = $2 AND entry_type = 'opex'`,
      [companyId, periodKey],
    );
    return Number(r.rows[0]?.total ?? 0);
  }

  async distributeDividendPool(
    db: Db,
    input: { companyId: string; poolMinor: number; periodKey: string },
  ): Promise<{ totalDistributedMinor: number; recipientCount: number }> {
    if (input.poolMinor <= 0) return { totalDistributedMinor: 0, recipientCount: 0 };
    const shareholders = await db.query<{ holder_character_id: string; shares: string; user_id: string | null }>(
      `SELECT s.holder_character_id, s.shares::text AS shares, c.user_id
       FROM company_shareholders s
       JOIN characters c ON c.id = s.holder_character_id
       WHERE s.company_id = $1 AND s.shares > 0`,
      [input.companyId],
    );
    const totalShares = shareholders.rows.reduce((sum, s) => sum + Number(s.shares), 0);
    if (shareholders.rows.length === 0 || totalShares <= 0) {
      // Không có cổ đông: giữ lại trong quỹ công ty (không chia)
      return { totalDistributedMinor: 0, recipientCount: 0 };
    }

    let distributed = 0;
    let recipients = 0;
    const entries = shareholders.rows.map((s) => ({
      holderId: s.holder_character_id,
      shares: Number(s.shares),
      userId: s.user_id,
    }));
    // Phân bổ theo tỉ lệ, phần dư dồn vào cổ đông lớn nhất để đảm bảo tổng khớp
    const provisional = entries.map((e) => ({
      ...e,
      amount: Math.floor((e.shares / totalShares) * input.poolMinor),
    }));
    let remainder = input.poolMinor - provisional.reduce((s, e) => s + e.amount, 0);
    provisional.sort((a, b) => b.shares - a.shares || a.holderId.localeCompare(b.holderId));
    for (let i = 0; i < provisional.length && remainder > 0; i++) {
      const item = provisional[i];
      if (!item) break;
      item.amount += 1;
      remainder -= 1;
    }

    // Trừ quỹ công ty và chi trả cổ đông qua ledger (ghi nhận lịch sử giao dịch)
    for (const p of provisional) {
      if (p.amount <= 0) continue;
      await ledger.transfer(db as any, {
        from: { ownerType: 'company', ownerId: input.companyId, kind: 'cash' },
        to: { ownerType: 'character', ownerId: p.holderId, kind: 'cash' },
        amountMinor: p.amount,
        kind: 'company_dividend_auto',
        description: `Cổ tức tự động kỳ ${input.periodKey}`,
        referenceType: 'company',
        referenceId: input.companyId,
      });
      distributed += p.amount;
      recipients += 1;
    }

    return { totalDistributedMinor: distributed, recipientCount: recipients };
  }

  /** Giải phóng claim HQ trên các property (khi phá dỡ/hủy hợp thửa) và trả về danh sách công ty bị ảnh hưởng. */
  async invalidateCompaniesForDemolishedCoreProperties(
    db: Db,
    propertyIds: string[],
    reason: string,
  ): Promise<Array<{ companyId: string; ownerUserId: string | null; companyName: string }>> {
    if (propertyIds.length === 0) return [];
    const affected = await db.query<{ id: string; name: string; user_id: string | null }>(
      `SELECT DISTINCT c.id, c.name, ch.user_id
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       LEFT JOIN properties p ON p.id = ANY($1::uuid[]) AND p.hq_company_id = c.id
       WHERE (c.premises_type = 'land_core' AND c.premises_core_property_id = ANY($1::uuid[]))
          OR p.hq_company_id = c.id`,
      [propertyIds],
    );
    if (affected.rows.length === 0) {
      await db.query(`UPDATE properties SET hq_company_id = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) AND hq_company_id IS NOT NULL`, [propertyIds]);
      return [];
    }
    const companyIds = affected.rows.map((r) => r.id);
    await db.query(
      `UPDATE companies
          SET premises_needs_reselection = true,
              premises_invalid_reason = $2,
              updated_at = now()
        WHERE id = ANY($1::uuid[])`,
      [companyIds, reason],
    );
    await db.query(
      `UPDATE properties SET hq_company_id = NULL, updated_at = now()
       WHERE hq_company_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`,
      [companyIds, propertyIds],
    );
    return affected.rows.map((r) => ({ companyId: r.id, ownerUserId: r.user_id, companyName: r.name }));
  }

  async invalidateCompaniesForDemolishedProvinceProperties(
    db: Db,
    propertyIds: string[],
    reason: string,
  ): Promise<Array<{ companyId: string; ownerUserId: string | null; companyName: string }>> {
    if (propertyIds.length === 0) return [];
    const affected = await db.query<{ id: string; name: string; user_id: string | null }>(
      `SELECT DISTINCT c.id, c.name, ch.user_id
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       LEFT JOIN province_land_properties p ON p.id = ANY($1::uuid[]) AND p.hq_company_id = c.id
       WHERE (c.premises_type = 'land_province' AND c.premises_province_land_property_id = ANY($1::uuid[]))
          OR p.hq_company_id = c.id`,
      [propertyIds],
    );
    if (affected.rows.length === 0) {
      await db.query(`UPDATE province_land_properties SET hq_company_id = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) AND hq_company_id IS NOT NULL`, [propertyIds]);
      return [];
    }
    const companyIds = affected.rows.map((r) => r.id);
    await db.query(
      `UPDATE companies
          SET premises_needs_reselection = true,
              premises_invalid_reason = $2,
              updated_at = now()
        WHERE id = ANY($1::uuid[])`,
      [companyIds, reason],
    );
    await db.query(
      `UPDATE province_land_properties SET hq_company_id = NULL, updated_at = now()
       WHERE hq_company_id = ANY($1::uuid[]) OR id = ANY($2::uuid[])`,
      [companyIds, propertyIds],
    );
    return affected.rows.map((r) => ({ companyId: r.id, ownerUserId: r.user_id, companyName: r.name }));
  }

  async releasePremisesClaim(db: Db, companyId: string): Promise<void> {
    await db.query(`UPDATE properties SET hq_company_id = NULL, updated_at = now() WHERE hq_company_id = $1`, [companyId]);
    await db.query(`UPDATE province_land_properties SET hq_company_id = NULL, updated_at = now() WHERE hq_company_id = $1`, [companyId]);
  }

  async relocatePremises(
    db: Db,
    companyId: string,
    premises: { type: 'land_core' | 'land_province' | 'company_property'; provinceCode: string | null; corePropertyId: string | null; provinceLandPropertyId: string | null; companyPropertyId: string | null },
  ): Promise<void> {
    await db.query(
      `UPDATE companies
          SET premises_type = $2,
              premises_province_code = $3,
              premises_core_property_id = $4,
              premises_province_land_property_id = $5,
              premises_company_property_id = $6,
              premises_needs_reselection = false,
              premises_invalid_reason = NULL,
              updated_at = now()
        WHERE id = $1`,
      [companyId, premises.type, premises.provinceCode, premises.corePropertyId, premises.provinceLandPropertyId, premises.companyPropertyId],
    );
  }

  async setRevenueRetainPct(db: Db, companyId: string, retainPct: number): Promise<void> {
    await db.query(
      `UPDATE companies SET revenue_retain_pct = $2, updated_at = now() WHERE id = $1`,
      [companyId, retainPct],
    );
  }

  // --- Share offerings (IPO primary issuance) ---
  async createShareOffering(db: Db, input: { companyId: string; createdByCharacterId: string; totalShares: number; pricePerShareMinor: number; endsAt: Date }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_share_offerings
         (company_id, created_by_character_id, total_shares, remaining_shares, price_per_share_minor, status, ends_at)
       VALUES ($1,$2,$3,$3,$4,'open',$5)
       RETURNING id`,
      [input.companyId, input.createdByCharacterId, input.totalShares, input.pricePerShareMinor, input.endsAt],
    );
    return r.rows[0]!.id;
  }

  async listShareOfferings(db: Db, opts?: { companyId?: string; openOnly?: boolean }): Promise<any[]> {
    const params: any[] = [];
    const where: string[] = [];
    if (opts?.companyId) { params.push(opts.companyId); where.push(`o.company_id = $${params.length}`); }
    if (opts?.openOnly) { where.push(`o.status = 'open' AND o.ends_at > now() AND o.remaining_shares > 0`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await db.query(
      `SELECT o.id, o.company_id AS "companyId", c.name AS "companyName", c.ticker_symbol AS "companyTicker",
              o.created_by_character_id AS "createdByCharacterId",
              o.total_shares AS "totalShares", o.remaining_shares AS "remainingShares",
              o.price_per_share_minor AS "pricePerShareMinor", o.status,
              o.starts_at AS "startsAt", o.ends_at AS "endsAt", o.created_at AS "createdAt", o.closed_at AS "closedAt"
       FROM company_share_offerings o
       JOIN companies c ON c.id = o.company_id
       ${whereSql}
       ORDER BY (o.status = 'open') DESC, o.created_at DESC
       LIMIT 200`,
      params,
    );
    return r.rows.map((row: any) => {
      if (row.status === 'open' && (new Date(row.endsAt).getTime() <= Date.now() || Number(row.remainingShares) <= 0)) {
        return { ...row, status: Number(row.remainingShares) <= 0 ? 'completed' : 'closed' };
      }
      return row;
    });
  }

  async getShareOfferingForUpdate(db: Db, offeringId: string): Promise<any | null> {
    const r = await db.query(
      `SELECT o.id, o.company_id AS "companyId", o.created_by_character_id AS "createdByCharacterId",
              o.total_shares AS "totalShares", o.remaining_shares AS "remainingShares",
              o.price_per_share_minor AS "pricePerShareMinor", o.status,
              o.starts_at AS "startsAt", o.ends_at AS "endsAt",
              c.name AS "companyName", c.ticker_symbol AS "companyTicker", c.status AS "companyStatus"
       FROM company_share_offerings o
       JOIN companies c ON c.id = o.company_id
       WHERE o.id = $1
       FOR UPDATE`,
      [offeringId],
    );
    return r.rows[0] ?? null;
  }

  async upsertShareholder(db: Db, companyId: string, holderCharacterId: string, deltaShares: number): Promise<void> {
    await db.query(
      `INSERT INTO company_shareholders (id, company_id, holder_character_id, shares)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (company_id, holder_character_id)
       DO UPDATE SET shares = company_shareholders.shares + $3`,
      [companyId, holderCharacterId, deltaShares],
    );
  }

  async recordOfferingPurchase(db: Db, input: { offeringId: string; companyId: string; buyerCharacterId: string; shares: number; pricePerShareMinor: number; totalCostMinor: number }): Promise<void> {
    await db.query(
      `INSERT INTO company_share_offering_purchases (offering_id, company_id, buyer_character_id, shares, price_per_share_minor, total_cost_minor)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.offeringId, input.companyId, input.buyerCharacterId, input.shares, input.pricePerShareMinor, input.totalCostMinor],
    );
    await db.query(
      `UPDATE company_share_offerings
          SET remaining_shares = remaining_shares - $2,
              status = CASE WHEN remaining_shares - $2 <= 0 THEN 'completed' ELSE status END,
              closed_at = CASE WHEN remaining_shares - $2 <= 0 THEN now() ELSE closed_at END
        WHERE id = $1`,
      [input.offeringId, input.shares],
    );
  }
}

export const corporationRepository = new CorporationRepository();
