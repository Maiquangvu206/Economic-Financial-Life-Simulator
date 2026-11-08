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
}

interface CreateCompanyInput {
  name: string;
  industry: string;
  ownerCharacterId: string;
  initialCapitalMinor: number;
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

  /** Danh sách tất cả công ty, kèm chủ sở hữu và mã chứng khoán (nếu đã IPO). */
  async listCompanies(): Promise<CompanyRow[]> {
    const result = await this.db.query<CompanyRow>(
      `SELECT c.id, c.name, c.industry, c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName", c.cash_minor AS "cashMinor",
              c.valuation_minor AS "valuationMinor", c.status, c.ticker_symbol AS "tickerSymbol",
              c.founded_at AS "foundedAt", c.updated_at AS "updatedAt"
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
       ORDER BY c.updated_at DESC`,
    );
    return result.rows;
  }

  async getCompany(id: string, db: Db = this.db): Promise<CompanyRow | null> {
    const result = await db.query<CompanyRow>(
      `SELECT c.id, c.name, c.industry, c.owner_character_id AS "ownerCharacterId",
              ch.full_name AS "ownerName", c.cash_minor AS "cashMinor",
              c.valuation_minor AS "valuationMinor", c.status, c.ticker_symbol AS "tickerSymbol",
              c.founded_at AS "foundedAt", c.updated_at AS "updatedAt"
       FROM companies c
       JOIN characters ch ON ch.id = c.owner_character_id
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
      `INSERT INTO companies (id, name, industry, owner_character_id, cash_minor,
              valuation_minor, status, ticker_symbol)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $4, 'active', NULL)
       RETURNING id`,
      [input.name, input.industry, input.ownerCharacterId, input.initialCapitalMinor],
    );
    return result.rows[0]!.id;
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
}

export const corporationRepository = new CorporationRepository();
