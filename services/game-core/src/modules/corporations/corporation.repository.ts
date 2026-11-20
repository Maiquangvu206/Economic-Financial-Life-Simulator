import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';

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
  ownerSalaryMinor: string;
  ownerJobTitle: string | null;
  ownerEmploymentId: string | null;
}

export interface CompanyEmployeeRow {
  employmentId: string;
  characterId: string;
  characterName: string;
  jobTitle: string;
  salaryMinor: string;
  salaryArrearsMinor?: string;
  status: 'active' | 'notice_pending' | 'resigned' | 'fired';
  hiredAt: Date;
  isOwnerRole?: boolean;
  salaryLastChangedAt?: Date | null;
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
            COALESCE(c.revenue_retain_pct, 0)::float AS "revenueRetainPct",
            COALESCE(NULLIF(to_jsonb(c)->>'owner_salary_minor','')::bigint, 0)::text AS "ownerSalaryMinor",
            (to_jsonb(c)->>'owner_job_title') AS "ownerJobTitle",
            NULLIF(to_jsonb(c)->>'owner_employment_id','')::uuid::text AS "ownerEmploymentId"
     FROM companies c
    JOIN characters ch ON ch.id = c.owner_character_id
    LEFT JOIN properties cp ON cp.id = c.premises_core_property_id
    LEFT JOIN province_land_properties plp ON plp.id = c.premises_province_land_property_id
    LEFT JOIN provinces pr ON pr.code = c.premises_province_code
    LEFT JOIN properties hp ON hp.id = c.premises_company_property_id
    LEFT JOIN companies host ON host.id = hp.owner_company_id
  `;

  /** Danh sách công ty đang hoạt động/IPO (không bao gồm đã giải thể/phá sản/sáp nhập), kèm chủ sở hữu và mã chứng khoán (nếu có). */
  async listCompanies(): Promise<CompanyRow[]> {
    const result = await this.db.query<CompanyRow>(
      `${CorporationRepository.COMPANY_SELECT}
       WHERE c.status NOT IN ('bankrupt', 'merged')
       ORDER BY c.updated_at DESC`,
    );
    return result.rows;
  }

  async getCompany(id: string, db: Db = this.db): Promise<CompanyRow | null> {
    const result = await db.query<CompanyRow>(
      `${CorporationRepository.COMPANY_SELECT}
       WHERE c.id = $1 AND c.status NOT IN ('bankrupt', 'merged')`,
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
              e.salary_minor AS "salaryMinor",
              COALESCE(NULLIF(to_jsonb(e)->>'salary_arrears_minor','')::bigint, 0)::text AS "salaryArrearsMinor",
              e.status, e.hired_at AS "hiredAt",
              COALESCE((to_jsonb(e)->>'is_owner_role')::boolean, false) AS "isOwnerRole",
              NULLIF(to_jsonb(e)->>'salary_last_changed_at','')::timestamptz AS "salaryLastChangedAt"
       FROM employments e
       JOIN characters ch ON ch.id = e.character_id
       JOIN jobs j ON j.id = e.job_id
       WHERE e.company_id = $1
       ORDER BY COALESCE((to_jsonb(e)->>'is_owner_role')::boolean, false) DESC, e.hired_at DESC`,
      [companyId],
    );
    return result.rows;
  }

  async fireEmployee(db: Db, companyId: string, employmentId: string): Promise<boolean> {
    const result = await db.query<{ id: string }>(
      `UPDATE employments
       SET status = 'fired', ended_at = now()
       WHERE id = $1 AND company_id = $2 AND status IN ('active','notice_pending') AND COALESCE((to_jsonb(employments)->>'is_owner_role')::boolean, false) = false
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
              salary_minor AS "salaryMinor",
              COALESCE(NULLIF(to_jsonb(company_staff)->>'salary_arrears_minor','')::bigint, 0)::text AS "salaryArrearsMinor",
              status, hired_at AS "hiredAt", fired_at AS "firedAt",
              NULLIF(to_jsonb(company_staff)->>'salary_last_changed_at','')::timestamptz AS "salaryLastChangedAt"
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
         (
           COALESCE((SELECT SUM(actual_revenue_minor) FROM company_revenue_settlements WHERE company_id = $1), 0)
           + COALESCE((SELECT SUM(amount_minor) FROM company_ledger_entries
                       WHERE company_id = $1 AND entry_type = 'revenue' AND ledger_kind <> 'ACTUAL'), 0)
         )::bigint AS revenue,
         COALESCE(SUM(CASE WHEN entry_type IN ('opex','payroll','tax','fine','bribe','other') THEN amount_minor ELSE 0 END),0)::bigint AS expense,
         (
           COALESCE((SELECT SUM(actual_revenue_minor) FROM company_revenue_settlements WHERE company_id = $1), 0)
           + COALESCE((SELECT SUM(declared_amount_minor) FROM company_ledger_entries
                       WHERE company_id = $1 AND entry_type = 'revenue' AND ledger_kind <> 'ACTUAL'), 0)
         )::bigint AS "declaredRevenue",
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

  async listRevenueSettlements(companyId: string, limit = 24, db: Db = this.db): Promise<any[]> {
    const r = await db.query(
      `SELECT s.id,
              s.period_key AS "periodKey",
              s.game_year AS "gameYear",
              s.game_month AS "gameMonth",
              s.base_capital_minor AS "baseCapitalMinor",
              s.monthly_rate_pct AS "monthlyRatePct",
              s.season_multiplier AS "seasonMultiplier",
              s.actual_revenue_minor AS "actualRevenueMinor",
              s.status,
              s.settled_at AS "settledAt",
              (f.id IS NOT NULL) AS "filed",
              f.status AS "filingStatus",
              f.declared_revenue_minor AS "declaredRevenueMinor",
              f.tax_paid_minor AS "taxPaidMinor"
       FROM company_revenue_settlements s
       LEFT JOIN company_tax_filings f ON f.company_id = s.company_id AND f.period_key = s.period_key
       WHERE s.company_id = $1
       ORDER BY s.game_year DESC, s.game_month DESC, s.settled_at DESC
       LIMIT $2`,
      [companyId, limit],
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

  async setOwnerSalary(db: Db, companyId: string, salaryMinor: number): Promise<void> {
    await db.query(
      `UPDATE companies SET owner_salary_minor = $2::bigint, updated_at = now() WHERE id = $1`,
      [companyId, salaryMinor],
    );
  }

  async getOwnerActiveEmployment(db: Db, characterId: string): Promise<{
    id: string; jobId: string; companyId: string | null; salaryMinor: string; isOwnerRole: boolean; status: string;
  } | null> {
    const r = await db.query<{ id: string; jobId: string; companyId: string | null; salaryMinor: string; isOwnerRole: boolean; status: string }>(
      `SELECT id, job_id AS "jobId", company_id AS "companyId", salary_minor AS "salaryMinor",
              COALESCE((to_jsonb(employments)->>'is_owner_role')::boolean, false) AS "isOwnerRole", status
       FROM employments
       WHERE character_id = $1 AND status IN ('active','notice_pending')
       LIMIT 1`,
      [characterId],
    );
    return r.rows[0] ?? null;
  }

  async getEmploymentById(db: Db, employmentId: string): Promise<{
    id: string; characterId: string; jobId: string; companyId: string | null; salaryMinor: string; isOwnerRole: boolean; status: string; hiredAt: Date;
  } | null> {
    const r = await db.query<any>(
      `SELECT id, character_id AS "characterId", job_id AS "jobId", company_id AS "companyId",
              salary_minor AS "salaryMinor", COALESCE((to_jsonb(employments)->>'is_owner_role')::boolean, false) AS "isOwnerRole",
              status, hired_at AS "hiredAt"
       FROM employments WHERE id = $1`,
      [employmentId],
    );
    return r.rows[0] ?? null;
  }

  async ensureOwnerJob(db: Db, companyId: string, companyName: string, jobTitle: string): Promise<string> {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM jobs WHERE employer_company_id = $1 AND COALESCE(is_owner_role,false) = true LIMIT 1`,
      [companyId],
    );
    if (existing.rows[0]) {
      await db.query(
        `UPDATE jobs
            SET title = $2, is_owner_role = true, openings = 0, posting_status = 'closed', base_salary_minor = 0
          WHERE id = $1`,
        [existing.rows[0].id, jobTitle],
      ).catch(async () => {
        // posting_status column may not exist in older schema; fallback minimal update
        await db.query(
          `UPDATE jobs SET title = $2, is_owner_role = true, openings = 0, base_salary_minor = 0 WHERE id = $1`,
          [existing.rows[0]!.id, jobTitle],
        );
      });
      return existing.rows[0].id;
    }
    try {
      const ins = await db.query<{ id: string }>(
        `INSERT INTO jobs (id, title, industry, employer_company_id, base_salary_minor, required_degree, min_credit_score, energy_cost, openings, is_owner_role, posting_status)
         VALUES (gen_random_uuid(), $1, (SELECT industry FROM companies WHERE id = $2), $2, 0, NULL, 0, 0, 0, true, 'closed')
         RETURNING id`,
        [jobTitle, companyId],
      );
      return ins.rows[0]!.id;
    } catch {
      const ins = await db.query<{ id: string }>(
        `INSERT INTO jobs (id, title, industry, employer_company_id, base_salary_minor, required_degree, min_credit_score, energy_cost, openings, is_owner_role)
         VALUES (gen_random_uuid(), $1, (SELECT industry FROM companies WHERE id = $2), $2, 0, NULL, 0, 0, 0, true)
         RETURNING id`,
        [jobTitle, companyId],
      );
      return ins.rows[0]!.id;
    }
  }

  async upsertOwnerEmployment(
    db: Db,
    input: { companyId: string; ownerCharacterId: string; jobId: string; salaryMinor: number },
  ): Promise<{ employmentId: string; created: boolean } | null> {
    // If owner already has an active employment that is NOT this company's owner role, cannot create (unique active per character).
    const active = await this.getOwnerActiveEmployment(db, input.ownerCharacterId);
    if (active && !(active.isOwnerRole && active.companyId === input.companyId)) {
      return null;
    }

    if (active && active.isOwnerRole && active.companyId === input.companyId) {
      await db.query(
        `UPDATE employments
            SET salary_minor = $2::bigint, job_id = $3, company_id = $4, is_owner_role = true, status = 'active', ended_at = NULL
          WHERE id = $1`,
        [active.id, input.salaryMinor, input.jobId, input.companyId],
      );
      await db.query(`UPDATE companies SET owner_employment_id = $2, updated_at = now() WHERE id = $1`, [input.companyId, active.id]);
      return { employmentId: active.id, created: false };
    }

    try {
      const ins = await db.query<{ id: string }>(
        `INSERT INTO employments (id, character_id, job_id, company_id, salary_minor, status, is_owner_role)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::bigint, 'active', true)
         RETURNING id`,
        [input.ownerCharacterId, input.jobId, input.companyId, input.salaryMinor],
      );
      const employmentId = ins.rows[0]!.id;
      await db.query(`UPDATE companies SET owner_employment_id = $2, updated_at = now() WHERE id = $1`, [input.companyId, employmentId]);
      return { employmentId, created: true };
    } catch {
      // race/constraint fallback: if owner active employment now exists for this company, update it
      const again = await this.getOwnerActiveEmployment(db, input.ownerCharacterId);
      if (again && again.isOwnerRole && again.companyId === input.companyId) {
        await db.query(
          `UPDATE employments SET salary_minor = $2::bigint, job_id = $3, company_id = $4, is_owner_role = true, status = 'active', ended_at = NULL WHERE id = $1`,
          [again.id, input.salaryMinor, input.jobId, input.companyId],
        );
        await db.query(`UPDATE companies SET owner_employment_id = $2, updated_at = now() WHERE id = $1`, [input.companyId, again.id]);
        return { employmentId: again.id, created: false };
      }
      return null;
    }
  }

  async endOwnerEmployment(db: Db, companyId: string): Promise<void> {
    await db.query(
      `UPDATE employments
          SET status = 'resigned', ended_at = now()
        WHERE company_id = $1 AND COALESCE(is_owner_role,false) = true AND status IN ('active','notice_pending')`,
      [companyId],
    );
    await db.query(`UPDATE companies SET owner_employment_id = NULL, updated_at = now() WHERE id = $1`, [companyId]);
  }

  async getOwnerRoleSnapshot(db: Db, companyId: string): Promise<{
    ownerCharacterId: string;
    ownerName: string;
    ownerSalaryMinor: string;
    ownerJobTitle: string | null;
    ownerEmploymentId: string | null;
    companyStatus: string;
    activeEmploymentId: string | null;
    activeEmploymentIsOwnerRole: boolean | null;
    activeEmploymentCompanyId: string | null;
    activeEmploymentHiredAt: Date | null;
  } | null> {
    const r = await db.query<any>(
      `SELECT c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName",
              COALESCE(NULLIF(to_jsonb(c)->>'owner_salary_minor','')::bigint, 0)::text AS "ownerSalaryMinor",
              (to_jsonb(c)->>'owner_job_title') AS "ownerJobTitle",
              NULLIF(to_jsonb(c)->>'owner_employment_id','')::uuid::text AS "ownerEmploymentId",
              c.status AS "companyStatus",
              ae.id AS "activeEmploymentId",
              COALESCE((to_jsonb(ae)->>'is_owner_role')::boolean, false) AS "activeEmploymentIsOwnerRole",
              ae.company_id AS "activeEmploymentCompanyId",
              ae.hired_at AS "activeEmploymentHiredAt"
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       LEFT JOIN employments ae ON ae.character_id = c.owner_character_id AND ae.status IN ('active','notice_pending')
       WHERE c.id = $1`,
      [companyId],
    );
    return r.rows[0] ?? null;
  }

  async getEmploymentForCompany(
    db: Db,
    companyId: string,
    employmentId: string,
  ): Promise<{
    id: string;
    characterId: string;
    companyId: string | null;
    salaryMinor: string;
    salaryArrearsMinor: string;
    salaryLastChangedAt: Date | null;
    status: string;
    isOwnerRole: boolean;
  } | null> {
    const r = await db.query<any>(
      `SELECT id,
              character_id AS "characterId",
              company_id AS "companyId",
              salary_minor AS "salaryMinor",
              COALESCE(NULLIF(to_jsonb(employments)->>'salary_arrears_minor','')::bigint, 0)::text AS "salaryArrearsMinor",
              NULLIF(to_jsonb(employments)->>'salary_last_changed_at','')::timestamptz AS "salaryLastChangedAt",
              status,
              COALESCE((to_jsonb(employments)->>'is_owner_role')::boolean, false) AS "isOwnerRole"
       FROM employments
       WHERE id = $1 AND company_id = $2`,
      [employmentId, companyId],
    );
    return r.rows[0] ?? null;
  }

  async updateEmploymentSalary(
    db: Db,
    employmentId: string,
    newSalaryMinor: number,
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE employments
            SET salary_minor = $2::bigint,
                salary_last_changed_at = now(),
                salary_change_count = COALESCE(NULLIF(to_jsonb(employments)->>'salary_change_count','')::int, 0) + 1
          WHERE id = $1`,
        [employmentId, newSalaryMinor],
      );
    } catch (e: any) {
      if (e?.code === '42703') {
        await db.query(`UPDATE employments SET salary_minor = $2::bigint WHERE id = $1`, [employmentId, newSalaryMinor]);
        return;
      }
      throw e;
    }
  }

  async getStaffForCompany(
    db: Db,
    companyId: string,
    staffId: string,
  ): Promise<{
    id: string;
    companyId: string;
    salaryMinor: string;
    salaryArrearsMinor: string;
    salaryLastChangedAt: Date | null;
    status: string;
  } | null> {
    const r = await db.query<any>(
      `SELECT id, company_id AS "companyId", salary_minor AS "salaryMinor",
              COALESCE(NULLIF(to_jsonb(company_staff)->>'salary_arrears_minor','')::bigint, 0)::text AS "salaryArrearsMinor",
              NULLIF(to_jsonb(company_staff)->>'salary_last_changed_at','')::timestamptz AS "salaryLastChangedAt",
              status
       FROM company_staff
       WHERE id = $1 AND company_id = $2`,
      [staffId, companyId],
    );
    return r.rows[0] ?? null;
  }

  async updateStaffSalary(db: Db, staffId: string, newSalaryMinor: number): Promise<void> {
    try {
      await db.query(
        `UPDATE company_staff
            SET salary_minor = $2::bigint,
                salary_last_changed_at = now(),
                salary_change_count = COALESCE(NULLIF(to_jsonb(company_staff)->>'salary_change_count','')::int, 0) + 1
          WHERE id = $1`,
        [staffId, newSalaryMinor],
      );
    } catch (e: any) {
      if (e?.code === '42703') {
        await db.query(`UPDATE company_staff SET salary_minor = $2::bigint WHERE id = $1`, [staffId, newSalaryMinor]);
        return;
      }
      throw e;
    }
  }

  async recordPayrollAdjustment(
    db: Db,
    input: {
      companyId: string;
      targetType: 'employment' | 'staff';
      targetId: string;
      oldSalaryMinor: number;
      newSalaryMinor: number;
      changedByCharacterId?: string | null;
      reason?: string | null;
      meta?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO company_payroll_adjustments
           (company_id, target_type, target_id, old_salary_minor, new_salary_minor, changed_by_character_id, reason, meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
        [
          input.companyId,
          input.targetType,
          input.targetId,
          input.oldSalaryMinor,
          input.newSalaryMinor,
          input.changedByCharacterId ?? null,
          input.reason ?? null,
          JSON.stringify(input.meta ?? {}),
        ],
      );
    } catch (e: any) {
      // Backward-compatible if migration not applied yet
      if (e?.code === '42P01' || e?.code === '42703') return;
      throw e;
    }
  }

  async getPayrollForecast(companyId: string, db: Db = this.db): Promise<{
    employeeMonthlyMinor: number;
    staffMonthlyMinor: number;
    ownerMonthlyMinor: number;
    employeeArrearsMinor: number;
    staffArrearsMinor: number;
  }> {
    const [emp, staff, company] = await Promise.all([
      db.query<any>(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('active','notice_pending') AND COALESCE((to_jsonb(employments)->>'is_owner_role')::boolean,false)=false THEN salary_minor ELSE 0 END), 0)::bigint::text AS "monthlyMinor",
           COALESCE(SUM(COALESCE(NULLIF(to_jsonb(employments)->>'salary_arrears_minor','')::bigint, 0)), 0)::bigint::text AS "arrearsMinor"
         FROM employments
         WHERE company_id = $1`,
        [companyId],
      ),
      db.query<any>(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'active' THEN salary_minor ELSE 0 END), 0)::bigint::text AS "monthlyMinor",
           COALESCE(SUM(COALESCE(NULLIF(to_jsonb(company_staff)->>'salary_arrears_minor','')::bigint, 0)), 0)::bigint::text AS "arrearsMinor"
         FROM company_staff
         WHERE company_id = $1`,
        [companyId],
      ),
      db.query<any>(
        `SELECT COALESCE(NULLIF(to_jsonb(c)->>'owner_salary_minor','')::bigint, 0)::bigint::text AS "ownerMonthlyMinor",
                c.status AS status
         FROM companies c WHERE c.id = $1`,
        [companyId],
      ),
    ]);

    const ownerMonthlyMinor = company.rows[0] && company.rows[0].status !== 'bankrupt' ? Number(company.rows[0].ownerMonthlyMinor ?? 0) : 0;
    return {
      employeeMonthlyMinor: Number(emp.rows[0]?.monthlyMinor ?? 0),
      staffMonthlyMinor: Number(staff.rows[0]?.monthlyMinor ?? 0),
      ownerMonthlyMinor,
      employeeArrearsMinor: Number(emp.rows[0]?.arrearsMinor ?? 0),
      staffArrearsMinor: Number(staff.rows[0]?.arrearsMinor ?? 0),
    };
  }

  // === Company Groups ===
  async getCompanyControlForCharacter(db: Db, companyId: string, characterId: string): Promise<{ myShares: number; totalShares: number; controlPct: number }> {
    const r = await db.query<{ my_shares: string; total_shares: string }>(
      `SELECT
         COALESCE(SUM(CASE WHEN holder_character_id = $2 THEN shares ELSE 0 END), 0)::bigint::text AS my_shares,
         COALESCE(SUM(shares), 0)::bigint::text AS total_shares
       FROM company_shareholders
       WHERE company_id = $1 AND shares > 0`,
      [companyId, characterId],
    );
    const myShares = Number(r.rows[0]?.my_shares ?? 0);
    const totalShares = Number(r.rows[0]?.total_shares ?? 0);
    const controlPct = totalShares > 0 ? (myShares / totalShares) * 100 : 0;
    return { myShares, totalShares, controlPct };
  }

  async listCompanyGroupsForCharacter(db: Db, characterId: string): Promise<any[]> {
    const r = await db.query<any>(
      `SELECT g.id, g.name, g.holding_company_id AS "holdingCompanyId", hc.name AS "holdingCompanyName",
              g.owner_character_id AS "ownerCharacterId", ch.full_name AS "ownerName",
              g.status, g.created_at AS "createdAt", g.updated_at AS "updatedAt", g.dissolved_at AS "dissolvedAt"
       FROM company_groups g
       JOIN companies hc ON hc.id = g.holding_company_id
       JOIN characters ch ON ch.id = g.owner_character_id
       WHERE g.status = 'active' AND (
         g.owner_character_id = $1
         OR EXISTS (
           SELECT 1 FROM company_group_members m
           JOIN companies c ON c.id = m.company_id
           WHERE m.group_id = g.id AND m.status = 'active' AND c.owner_character_id = $1
         )
       )
       ORDER BY g.updated_at DESC, g.created_at DESC`,
      [characterId],
    );
    return r.rows;
  }

  async getCompanyGroupById(db: Db, groupId: string): Promise<any | null> {
    const r = await db.query<any>(
      `SELECT g.id, g.name, g.holding_company_id AS "holdingCompanyId", hc.name AS "holdingCompanyName",
              g.owner_character_id AS "ownerCharacterId", ch.full_name AS "ownerName",
              g.status, g.created_at AS "createdAt", g.updated_at AS "updatedAt", g.dissolved_at AS "dissolvedAt"
       FROM company_groups g
       JOIN companies hc ON hc.id = g.holding_company_id
       JOIN characters ch ON ch.id = g.owner_character_id
       WHERE g.id = $1`,
      [groupId],
    );
    return r.rows[0] ?? null;
  }

  async listCompanyGroupMembers(db: Db, groupId: string): Promise<any[]> {
    const r = await db.query<any>(
      `SELECT m.company_id AS "companyId", c.name AS "companyName", m.role, m.control_pct AS "controlPct",
              c.status, c.cash_minor AS "cashMinor", c.valuation_minor AS "valuationMinor"
       FROM company_group_members m
       JOIN companies c ON c.id = m.company_id
       WHERE m.group_id = $1 AND m.status = 'active'
       ORDER BY (m.role = 'holding') DESC, c.name ASC`,
      [groupId],
    );
    return r.rows;
  }

  async createCompanyGroup(db: Db, input: { name: string; holdingCompanyId: string; ownerCharacterId: string }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_groups (name, holding_company_id, owner_character_id)
       VALUES ($1,$2,$3) RETURNING id`,
      [input.name, input.holdingCompanyId, input.ownerCharacterId],
    );
    const groupId = r.rows[0]!.id;
    await db.query(
      `INSERT INTO company_group_members (group_id, company_id, role, control_pct, status)
       VALUES ($1,$2,'holding',100,'active')`,
      [groupId, input.holdingCompanyId],
    );
    return groupId;
  }

  async renameCompanyGroup(db: Db, groupId: string, name: string): Promise<void> {
    await db.query(`UPDATE company_groups SET name = $2, updated_at = now() WHERE id = $1`, [groupId, name]);
  }

  async dissolveCompanyGroup(db: Db, groupId: string): Promise<void> {
    await db.query(`UPDATE company_group_members SET status = 'removed', left_at = now() WHERE group_id = $1 AND status = 'active'`, [groupId]);
    await db.query(`UPDATE company_groups SET status = 'dissolved', dissolved_at = now(), updated_at = now() WHERE id = $1`, [groupId]);
  }

  async addCompanyGroupMember(db: Db, input: { groupId: string; companyId: string; controlPct: number }): Promise<void> {
    await db.query(
      `INSERT INTO company_group_members (group_id, company_id, role, control_pct, status)
       VALUES ($1,$2,'subsidiary',$3,'active')`,
      [input.groupId, input.companyId, input.controlPct],
    );
  }

  async removeCompanyGroupMember(db: Db, groupId: string, companyId: string): Promise<number> {
    const r = await db.query(
      `UPDATE company_group_members SET status = 'removed', left_at = now()
       WHERE group_id = $1 AND company_id = $2 AND status = 'active'`,
      [groupId, companyId],
    );
    return r.rowCount ?? 0;
  }

  async findActiveGroupForCompany(db: Db, companyId: string): Promise<{ groupId: string; groupName: string } | null> {
    const r = await db.query<{ group_id: string; group_name: string }>(
      `SELECT m.group_id, g.name AS group_name
       FROM company_group_members m
       JOIN company_groups g ON g.id = m.group_id
       WHERE m.company_id = $1 AND m.status = 'active' AND g.status = 'active'
       LIMIT 1`,
      [companyId],
    );
    if (!r.rows[0]) return null;
    return { groupId: r.rows[0].group_id, groupName: r.rows[0].group_name };
  }

  async listEligibleHoldingCompanies(db: Db, characterId: string): Promise<any[]> {
    const r = await db.query<any>(
      `SELECT c.id, c.name
       FROM companies c
       WHERE c.owner_character_id = $1 AND c.status IN ('active','ipo')
         AND NOT EXISTS (
           SELECT 1 FROM company_group_members m
           JOIN company_groups g ON g.id = m.group_id
           WHERE m.company_id = c.id AND m.status = 'active' AND g.status = 'active'
         )
       ORDER BY c.name ASC`,
      [characterId],
    );
    return r.rows;
  }

  // === Buyout offers ===
  async listBuyoutOffers(db: Db, opts?: { companyId?: string; acquirerCharacterId?: string }): Promise<any[]> {
    const params: any[] = [];
    const where: string[] = [];
    if (opts?.companyId) { params.push(opts.companyId); where.push(`o.company_id = $${params.length}`); }
    if (opts?.acquirerCharacterId) { params.push(opts.acquirerCharacterId); where.push(`o.acquirer_character_id = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const r = await db.query<any>(
      `SELECT o.id, o.company_id AS "companyId", c.name AS "companyName",
              o.acquirer_character_id AS "acquirerCharacterId", ch.full_name AS "acquirerName",
              o.price_per_share_minor AS "pricePerShareMinor", o.target_shares AS "targetShares",
              o.acquired_shares AS "acquiredShares", o.status, o.allow_squeeze_out AS "allowSqueezeOut",
              o.starts_at AS "startsAt", o.ends_at AS "endsAt", o.created_at AS "createdAt", o.closed_at AS "closedAt"
       FROM company_buyout_offers o
       JOIN companies c ON c.id = o.company_id
       JOIN characters ch ON ch.id = o.acquirer_character_id
       ${whereSql}
       ORDER BY (o.status = 'open') DESC, o.created_at DESC
       LIMIT 200`,
      params,
    );
    return r.rows;
  }

  async getBuyoutOfferForUpdate(db: Db, offerId: string): Promise<any | null> {
    const r = await db.query<any>(
      `SELECT o.*, c.name AS "companyName", c.status AS "companyStatus", c.owner_character_id AS "companyOwnerCharacterId", c.ticker_symbol AS "companyTicker"
       FROM company_buyout_offers o
       JOIN companies c ON c.id = o.company_id
       WHERE o.id = $1
       FOR UPDATE OF o`,
      [offerId],
    );
    return r.rows[0] ?? null;
  }

  async createBuyoutOffer(db: Db, input: { companyId: string; acquirerCharacterId: string; pricePerShareMinor: number; targetShares: number; endsAt: Date; allowSqueezeOut: boolean }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_buyout_offers (company_id, acquirer_character_id, price_per_share_minor, target_shares, ends_at, allow_squeeze_out)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [input.companyId, input.acquirerCharacterId, input.pricePerShareMinor, input.targetShares, input.endsAt, input.allowSqueezeOut],
    );
    return r.rows[0]!.id;
  }

  async updateBuyoutOfferProgress(db: Db, offerId: string, acquiredDelta: number, complete: boolean): Promise<void> {
    await db.query(
      `UPDATE company_buyout_offers
          SET acquired_shares = acquired_shares + $2,
              status = CASE WHEN $3::boolean THEN 'completed' ELSE status END,
              closed_at = CASE WHEN $3::boolean THEN now() ELSE closed_at END
        WHERE id = $1`,
      [offerId, acquiredDelta, complete],
    );
  }

  async setBuyoutOfferStatus(db: Db, offerId: string, status: string): Promise<void> {
    await db.query(
      `UPDATE company_buyout_offers SET status = $2, closed_at = CASE WHEN $2 IN ('completed','cancelled','expired') THEN now() ELSE closed_at END WHERE id = $1`,
      [offerId, status],
    );
  }

  async recordBuyoutPurchase(db: Db, input: { offerId: string; companyId: string; sellerCharacterId: string; buyerCharacterId: string; shares: number; pricePerShareMinor: number; totalCostMinor: number; isSqueezeOut: boolean }): Promise<void> {
    await db.query(
      `INSERT INTO company_buyout_purchases (offer_id, company_id, seller_character_id, buyer_character_id, shares, price_per_share_minor, total_cost_minor, is_squeeze_out)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.offerId, input.companyId, input.sellerCharacterId, input.buyerCharacterId, input.shares, input.pricePerShareMinor, input.totalCostMinor, input.isSqueezeOut],
    );
  }

  async getShareholderSharesForUpdate(db: Db, companyId: string, characterId: string): Promise<number> {
    const r = await db.query<{ shares: string }>(
      `SELECT shares::text AS shares FROM company_shareholders WHERE company_id = $1 AND holder_character_id = $2 FOR UPDATE`,
      [companyId, characterId],
    );
    return Number(r.rows[0]?.shares ?? 0);
  }

  async transferShares(db: Db, companyId: string, fromCharacterId: string, toCharacterId: string, shares: number): Promise<void> {
    await db.query(
      `UPDATE company_shareholders SET shares = shares - $3
       WHERE company_id = $1 AND holder_character_id = $2 AND shares >= $3`,
      [companyId, fromCharacterId, shares],
    );
    await db.query(`DELETE FROM company_shareholders WHERE company_id = $1 AND holder_character_id = $2 AND shares <= 0`, [companyId, fromCharacterId]);
    await this.upsertShareholder(db, companyId, toCharacterId, shares);
  }

  // === Merger ===
  async createMerger(db: Db, input: { survivorCompanyId: string; mergedCompanyId: string; executedByCharacterId: string; cashTransferredMinor: number; staffTransferred: number; employmentsTransferred: number; meta?: any }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO company_mergers (survivor_company_id, merged_company_id, executed_by_character_id, cash_transferred_minor, staff_transferred, employments_transferred, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id`,
      [input.survivorCompanyId, input.mergedCompanyId, input.executedByCharacterId, input.cashTransferredMinor, input.staffTransferred, input.employmentsTransferred, JSON.stringify(input.meta ?? {})],
    );
    return r.rows[0]!.id;
  }

  async markCompanyMerged(db: Db, mergedCompanyId: string, survivorCompanyId: string): Promise<void> {
    await db.query(
      `UPDATE companies
          SET status = 'merged', merged_into_company_id = $2, merged_at = now(), ticker_symbol = NULL, cash_minor = 0, updated_at = now()
        WHERE id = $1`,
      [mergedCompanyId, survivorCompanyId],
    );
  }

  async moveCompanyStaffToSurvivor(db: Db, mergedCompanyId: string, survivorCompanyId: string): Promise<number> {
    const r = await db.query(`UPDATE company_staff SET company_id = $2 WHERE company_id = $1`, [mergedCompanyId, survivorCompanyId]);
    return r.rowCount ?? 0;
  }

  async moveEmploymentsToSurvivor(db: Db, mergedCompanyId: string, survivorCompanyId: string): Promise<number> {
    const r = await db.query(
      `UPDATE employments SET company_id = $2
       WHERE company_id = $1 AND status IN ('active','notice_pending')`,
      [mergedCompanyId, survivorCompanyId],
    );
    return r.rowCount ?? 0;
  }

  async cleanupMergedCompanyMarketData(db: Db, mergedCompanyId: string): Promise<void> {
    const tickerRes = await db.query<{ id: string }>(`SELECT id FROM stock_tickers WHERE company_id = $1`, [mergedCompanyId]);
    const ticker = tickerRes.rows[0];
    if (ticker) {
      // best-effort: cancel/refund open buy orders similar to liquidation-lite
      const buyOrders = await db.query<{ id: string; character_id: string; refund_minor: string }>(
        `SELECT o.id, o.character_id, ((o.amount - o.filled_amount) * o.price_minor)::bigint AS refund_minor
         FROM stock_orders o
         WHERE o.ticker_id = $1 AND o.side = 'buy' AND o.status IN ('open','partially_filled') AND (o.amount - o.filled_amount) > 0`,
        [ticker.id],
      );
      for (const o of buyOrders.rows) {
        const refund = Number(o.refund_minor ?? 0);
        if (refund > 0) {
          await ledger.transfer(db as any, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'character', ownerId: o.character_id },
            amountMinor: refund,
            kind: 'order_escrow_refund',
            description: `Hoàn tiền lệnh mua do công ty sáp nhập`,
            referenceType: 'order',
            referenceId: o.id,
          }).catch(() => {});
        }
        await db.query(`UPDATE stock_orders SET status = 'cancelled', updated_at = now() WHERE id = $1`, [o.id]);
      }
      await db.query(`UPDATE stock_orders SET status = 'cancelled', updated_at = now() WHERE ticker_id = $1 AND status IN ('open','partially_filled')`, [ticker.id]);
      await db.query(`DELETE FROM stock_trades WHERE ticker_id = $1`, [ticker.id]);
      await db.query(`DELETE FROM stock_orders WHERE ticker_id = $1`, [ticker.id]);
      await db.query(`DELETE FROM stock_holdings WHERE ticker_id = $1`, [ticker.id]);
      await db.query(`DELETE FROM stock_tickers WHERE id = $1`, [ticker.id]);
    }
    await db.query(`DELETE FROM company_shareholders WHERE company_id = $1`, [mergedCompanyId]);
  }

  async transferPremisesClaimsToSurvivor(db: Db, mergedCompanyId: string, survivorCompanyId: string): Promise<void> {
    await db.query(`UPDATE properties SET hq_company_id = $2, updated_at = now() WHERE hq_company_id = $1`, [mergedCompanyId, survivorCompanyId]);
    await db.query(`UPDATE province_land_properties SET hq_company_id = $2, updated_at = now() WHERE hq_company_id = $1`, [mergedCompanyId, survivorCompanyId]);
    // premises fields on merged company no longer meaningful; survivor keeps its own
  }

  async getCompanyCashForUpdate(db: Db, companyId: string): Promise<number> {
    const r = await db.query<{ cash_minor: string }>(`SELECT cash_minor::text AS cash_minor FROM companies WHERE id = $1 FOR UPDATE`, [companyId]);
    return Number(r.rows[0]?.cash_minor ?? 0);
  }
}

export const corporationRepository = new CorporationRepository();
