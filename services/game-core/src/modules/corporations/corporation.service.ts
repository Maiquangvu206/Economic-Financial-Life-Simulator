import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId, resolveCharacterByCccd } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { callAiService } from '../../shared/ai/aiClient.js';
import { notify } from '../notifications/notification.service.js';
import {
  type CompanyDto,
  type CompanyEmployeesDto,
  type CompanyHrAccountingDto,
  type CompanyOverviewDto,
  type HiringPlanDto,
  MoneySchema,
} from '@efls/contracts';
import { corporationRepository } from './corporation.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toCompanyDto(
  row: Awaited<ReturnType<typeof corporationRepository.listCompanies>>[number],
): CompanyDto {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry as CompanyDto['industry'],
    ownerCharacterId: row.ownerCharacterId,
    ownerName: row.ownerName,
    cash: money(Number(row.cashMinor)),
    valuation: money(Number(row.valuationMinor)),
    status: row.status as CompanyDto['status'],
    tickerSymbol: row.tickerSymbol,
    foundedAt: row.foundedAt.toISOString(),
    isOwner: false, // điền lại ở caller nếu cần
  };
}

/** Dịch vụ doanh nghiệp: thành lập, quản lý công ty, đầu tư vốn. */
export class CorporationService {
  constructor(private readonly repository = corporationRepository) {}

  async getOverview(userId: string): Promise<CompanyOverviewDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const companies = await this.repository.listCompanies();
    const isOwner = new Set(
      companies.filter((c) => c.ownerCharacterId === character.id).map((c) => c.id),
    );

    return {
      companies: companies.map((c) => ({
        ...toCompanyDto(c),
        isOwner: isOwner.has(c.id),
      })),
    };
  }

  async getCompany(userId: string, companyId: string): Promise<CompanyDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const company = await this.repository.getCompany(companyId, db);
    if (!company) throw AppError.notFound('Company');
    const shareholders = await this.repository.listShareholders(companyId);
    const ownerShares = shareholders.find((s) => s.characterId === company.ownerCharacterId);

    return {
      ...toCompanyDto(company),
      isOwner: company.ownerCharacterId === character.id,
      shareholders: shareholders.map((s) => ({
        characterId: s.characterId,
        characterName: s.characterName,
        shares: s.shares,
        isOwner: s.characterId === company.ownerCharacterId,
        isMe: s.characterId === character.id,
        percentage: ownerShares ? Math.round((s.shares / ownerShares.shares) * 10000) / 100 : 0,
      })),
    };
  }

  /** Thành lập công ty mới: trừ vốn từ ví cá nhân, tạo công ty, cấp 100% cổ phiếu cho chủ sở hữu. */
  async createCompany(
    userId: string,
    name: string,
    industry: string,
    initialCapitalMinor: number,
  ): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const cash = toMinor(character.cash_minor);
      if (cash < initialCapitalMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để thành lập công ty.');
      }

      // Chuyển vốn từ ví cá nhân vào escrow (quản lý bởi hệ thống).
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
        amountMinor: initialCapitalMinor,
        kind: 'company_capital',
        description: `Vốn thành lập công ty ${name}`,
        referenceType: 'company',
        referenceId: undefined,
      });

      const companyId = await this.repository.createCompany(client, {
        name,
        industry,
        ownerCharacterId: character.id,
        initialCapitalMinor,
      });

      // Cấp giấy phép kinh doanh mặc định cho công ty mới.
      await this.repository.ensureBusinessLicense(client, companyId);

      // Cấp 100% cổ phiếu cho chủ sở hữu.
      await client.query(
        `INSERT INTO company_shareholders (id, company_id, holder_character_id, shares)
         VALUES (gen_random_uuid(), $1, $2, 1000000)`,
        [companyId, character.id],
      );

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Thành lập công ty',
        body: `Bạn đã thành lập công ty "${name}" với vốn khởi điểm ${formatMinor(initialCapitalMinor)} VND.`,
        payload: { companyId, name, industry, initialCapitalMinor },
      });

      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after creation');
      return {
        ...toCompanyDto(dto),
        isOwner: true,
        shareholders: [
          {
            characterId: character.id,
            characterName: character.full_name,
            shares: 1000000,
            isOwner: true,
            isMe: true,
            percentage: 100,
          },
        ],
      };
    });
  }

  /** Đầu tư vốn vào một công ty (chỉ chủ sở hữu hoặc bất kỳ ai cũng có thể đầu tư). */
  async investCompany(userId: string, companyId: string, amountMinor: number): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId);
      if (!company) throw AppError.notFound('Company');
      if (company.status !== 'active') {
        throw AppError.badRequest('Chỉ có thể đầu tư vào công ty đang hoạt động.');
      }

      const cash = toMinor(character.cash_minor);
      if (cash < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để đầu tư.');
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
        amountMinor,
        kind: 'company_investment',
        description: `Đầu tư vào công ty ${company.name}`,
        referenceType: 'company',
        referenceId: undefined,
      });

      await this.repository.investCompany(client, {
        companyId,
        investorCharacterId: character.id,
        amountMinor,
      });

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Đầu tư vào công ty',
        body: `Bạn đã đầu tư ${formatMinor(amountMinor)} VND vào "${company.name}".`,
        payload: { companyId, amountMinor },
      });

      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after investment');
      return {
        ...toCompanyDto(dto),
        isOwner: dto.ownerCharacterId === character.id,
        shareholders: [],
      };
    });
  }

  /** Chuyển công ty sang IPO: tạo mã chứng khoán, cấp cổ phiếu ban đầu cho chủ sở hữu. */
  async ipoCompany(
    userId: string,
    companyId: string,
    tickerSymbol: string,
    initialPriceMinor: number,
    totalShares: number,
  ): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu công ty mới được IPO.');
      }
      if (company.status !== 'active') {
        throw AppError.badRequest('Chỉ công ty đang hoạt động mới được IPO.');
      }
      if (company.tickerSymbol) {
        throw AppError.badRequest('Công ty đã được IPO.');
      }

      await this.repository.ipoCompany(client, {
        companyId,
        tickerSymbol,
        initialPriceMinor,
        totalShares,
      });

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Công ty niêm yết',
        body: `Công ty "${company.name}" đã niêm yết với mã ${tickerSymbol}, giá khởi điểm ${formatMinor(initialPriceMinor)} VND.`,
        payload: { companyId, tickerSymbol, initialPriceMinor, totalShares },
      });

      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after IPO');
      return { ...toCompanyDto(dto), isOwner: true, shareholders: [] };
    });
  }

  /** Phát hành cổ tức: công ty trả tiền cho mỗi cổ đông theo tỉ lệ sở hữu. */
  async payDividend(
    userId: string,
    companyId: string,
    amountPerShareMinor: number,
  ): Promise<{ totalDistributedMinor: number; recipientCount: number }> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu công ty mới được phát hành cổ tức.');
      }
      if (company.status !== 'active' && company.status !== 'ipo') {
        throw AppError.badRequest('Chỉ công ty đang hoạt động hoặc đã IPO mới được phát cổ tức.');
      }
      if (amountPerShareMinor <= 0) {
        throw AppError.badRequest('Số tiền cổ tức trên mỗi cổ phiếu phải lớn hơn 0.');
      }

      const result = await this.repository.payDividend(client, {
        companyId,
        amountPerShareMinor,
      });

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Phát hành cổ tức',
        body: `Công ty "${company.name}" đã phát cổ tức ${formatMinor(amountPerShareMinor)} / cổ phiếu, tổng cộng ${formatMinor(result.totalDistributedMinor)} VND đến ${result.recipientCount} cổ đông.`,
        payload: {
          companyId,
          amountPerShareMinor,
          totalDistributedMinor: result.totalDistributedMinor,
        },
      });

      return result;
    });
  }

  /** Khiêu kích thác đoá: nếu người mua sở hữu >51% cổ phiếu, trở thành chủ sở hữu mới. */
  async takeoverCompany(userId: string, companyId: string, buyer: { buyerCccd?: string; buyerCharacterId?: string }): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId); const buyerRef = buyer.buyerCccd ? await resolveCharacterByCccd(client, buyer.buyerCccd, { requireAlive: true }) : null; const buyerCharacterId = buyerRef?.id ?? buyer.buyerCharacterId; if (!buyerCharacterId) throw AppError.badRequest('Thiếu người thâu tóm (CCCD).');
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.status !== 'ipo') {
        throw AppError.badRequest('Chỉ công ty đã niêm yết mới có thể bị thác đoá.');
      }
      if (company.ownerCharacterId === buyerCharacterId) {
        throw AppError.badRequest('Chủ sở hữu hiện tại không thể thác đoá chính mình.');
      }

      const shareholders = await this.repository.listShareholders(companyId);
      const totalShares = shareholders.reduce((sum, s) => sum + s.shares, 0);
      const buyerShares = shareholders.find((s) => s.characterId === buyerCharacterId)?.shares ?? 0;
      if (totalShares <= 0 || buyerShares / totalShares <= 0.51) {
        throw AppError.badRequest('Cần sở hữu trên 51% cổ phiếu để thác đoá công ty.');
      }

      await this.repository.transferOwnership(client, companyId, buyerCharacterId);

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Thác đoá công ty',
        body: `${character.full_name} đã thác đoá "${company.name}" (${Math.round((buyerShares / totalShares) * 100)}% cổ phiếu).`,
        payload: { companyId, buyerCharacterId, previousOwner: company.ownerCharacterId },
      });

      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after takeover');
      return {
        ...toCompanyDto(dto),
        isOwner: dto.ownerCharacterId === buyerCharacterId,
        shareholders: [],
      };
    });
  }

  async getEmployees(userId: string, companyId: string): Promise<CompanyEmployeesDto> {
    const character = await requireCharacterByUserId(this.repository.db, userId);
    const company = await this.repository.getCompany(companyId);
    if (!company) throw AppError.notFound('Company');
    if (company.ownerCharacterId !== character.id) {
      throw AppError.forbidden('Chỉ chủ sở hữu mới xem được danh sách nhân sự.');
    }
    const employees = await this.repository.listEmployees(companyId);
    return {
      companyId,
      employees: employees.map((e) => ({
        employmentId: e.employmentId,
        characterId: e.characterId,
        characterName: e.characterName,
        jobTitle: e.jobTitle,
        salary: money(Number(e.salaryMinor)),
        status: e.status,
        hiredAt: e.hiredAt.toISOString(),
      })),
    };
  }

  async fireEmployee(userId: string, companyId: string, employmentId: string): Promise<void> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới sa thải nhân sự.');
      }
      const ok = await this.repository.fireEmployee(client, companyId, employmentId);
      if (!ok) throw AppError.notFound('Nhân sự (đang làm việc)');
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Sa thải nhân sự',
        body: `Đã chấm dứt hợp đồng lao động tại "${company.name}".`,
        payload: { companyId, employmentId },
      });
    });
  }

  async dissolveCompany(userId: string, companyId: string): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được giải thể công ty.');
      }
      if (company.status === 'bankrupt') {
        throw AppError.badRequest('Công ty đã ở trạng thái phá sản/giải thể.');
      }
      await this.repository.setBankrupt(client, companyId);
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Giải thể công ty',
        body: `Công ty "${company.name}" đã được giải thể (trạng thái phá sản).`,
        payload: { companyId },
      });
      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after dissolve');
      return { ...toCompanyDto(dto), isOwner: true, shareholders: [] };
    });
  }

  async collectRevenue(
    userId: string,
    companyId: string,
    amountMinor: number,
    note?: string,
  ): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới ghi nhận doanh thu.');
      }
      await this.requireActiveLicense(client, companyId);
      if (company.status === 'bankrupt') {
        throw AppError.badRequest('Công ty đã giải thể, không thể ghi nhận doanh thu.');
      }
      if (amountMinor <= 0 || amountMinor > 5_000_000_000) {
        throw AppError.badRequest('Số tiền doanh thu không hợp lệ (1 - 5.000.000.000 ₫ mỗi lần).');
      }
      await this.repository.adjustCash(client, companyId, amountMinor);
      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: 'revenue',
        amountMinor,
        declaredAmountMinor: amountMinor,
        description: note ?? 'Ghi nhận doanh thu',
        isEvasion: false,
      });
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Ghi nhận doanh thu',
        body: `Công ty "${company.name}" ghi nhận doanh thu ${formatMinor(amountMinor)}.${note ? ` Ghi chú: ${note}` : ''}`,
        payload: { companyId, amountMinor, note },
      });
      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after revenue');
      return { ...toCompanyDto(dto), isOwner: true, shareholders: [] };
    });
  }

  async payOpex(
    userId: string,
    companyId: string,
    amountMinor: number,
    note?: string,
  ): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới chi OPEX.');
      }
      await this.requireActiveLicense(client, companyId);
      if (company.status === 'bankrupt') {
        throw AppError.badRequest('Công ty đã giải thể, không thể chi OPEX.');
      }
      const cash = Number(company.cashMinor);
      if (amountMinor <= 0) throw AppError.badRequest('Số tiền OPEX phải lớn hơn 0.');
      if (cash < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Quỹ công ty không đủ để chi OPEX.');
      }
      await this.repository.adjustCash(client, companyId, -amountMinor);
      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: 'opex',
        amountMinor,
        declaredAmountMinor: amountMinor,
        description: note ?? 'Chi OPEX',
        isEvasion: false,
      });
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Chi OPEX',
        body: `Công ty "${company.name}" đã chi OPEX ${formatMinor(amountMinor)}.${note ? ` Ghi chú: ${note}` : ''}`,
        payload: { companyId, amountMinor, note },
      });
      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after opex');
      return { ...toCompanyDto(dto), isOwner: true, shareholders: [] };
    });
  }

  private async assertOwner(client: any, userId: string, companyId: string) {
    const character = await requireLivingCharacterByUserId(client, userId);
    const company = await this.repository.getCompany(companyId, client);
    if (!company) throw AppError.notFound('Company');
    if (company.ownerCharacterId !== character.id) {
      throw AppError.forbidden('Chỉ chủ sở hữu công ty mới thực hiện thao tác này.');
    }
    return { character, company };
  }

  /** Chặn hoạt động kinh doanh khi công ty không có giấy phép hoạt động. */
  private async requireActiveLicense(client: any, companyId: string): Promise<void> {
    const r = await client.query(
      `SELECT EXISTS(
         SELECT 1 FROM business_licenses
         WHERE company_id = $1 AND status = 'active'
       ) AS has`,
      [companyId],
    );
    if (!r.rows[0]?.has) {
      throw AppError.forbidden(
        'Công ty chưa có giấy phép kinh doanh hoạt động. Vui lòng cấp/xin cấp giấy phép trước khi vận hành.',
      );
    }
  }

  private mapHiringPlan(raw: any): HiringPlanDto {
    return {
      id: raw.id,
      companyId: raw.companyId,
      status: raw.status,
      roleFocus: raw.roleFocus ?? '',
      headcount: Number(raw.headcount ?? 0),
      rationale: raw.rationale ?? '',
      aiModel: raw.aiModel ?? null,
      createdAt: new Date(raw.createdAt).toISOString(),
      decidedAt: raw.decidedAt ? new Date(raw.decidedAt).toISOString() : null,
      appliedAt: raw.appliedAt ? new Date(raw.appliedAt).toISOString() : null,
      candidates: (raw.candidates ?? []).map((c: any) => ({
        id: c.id,
        fullName: c.fullName ?? c.full_name,
        roleTitle: c.roleTitle ?? c.role_title,
        seniority: c.seniority ?? 'junior',
        proposedSalary: money(Number(c.proposedSalaryMinor ?? c.proposed_salary_minor ?? 0)),
        fitScore: Number(c.fitScore ?? c.fit_score ?? 0),
        riskNote: c.riskNote ?? c.risk_note ?? '',
        aiReason: c.aiReason ?? c.ai_reason ?? '',
        status: c.status,
      })),
    };
  }

  async getHrAccounting(userId: string, companyId: string): Promise<CompanyHrAccountingDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const company = await this.repository.getCompany(companyId, db);
    if (!company) throw AppError.notFound('Company');
    if (company.ownerCharacterId !== character.id) {
      throw AppError.forbidden('Chỉ chủ sở hữu mới xem HR & kế toán.');
    }
    const [plansRaw, staff, entries, totals, filings] = await Promise.all([
      this.repository.listHiringPlans(companyId, db),
      this.repository.listCompanyStaff(companyId, db),
      this.repository.listLedgerEntries(companyId, 100, db),
      this.repository.ledgerTotals(companyId, db),
      this.repository.listTaxFilings(companyId, db),
    ]);
    return {
      companyId,
      plans: plansRaw.map((p) => this.mapHiringPlan(p)),
      staff: staff.map((s: any) => ({
        id: s.id,
        fullName: s.fullName ?? s.full_name,
        roleTitle: s.roleTitle ?? s.role_title,
        salary: money(Number(s.salaryMinor ?? s.salary_minor ?? 0)),
        status: s.status,
        hiredAt: new Date(s.hiredAt ?? s.hired_at).toISOString(),
        firedAt: s.firedAt || s.fired_at ? new Date(s.firedAt ?? s.fired_at).toISOString() : null,
      })),
      ledger: {
        companyId,
        entries: entries.map((e: any) => ({
          id: e.id,
          companyId: e.companyId ?? e.company_id ?? companyId,
          entryType: e.entryType ?? e.entry_type,
          amount: money(Number(e.amountMinor ?? e.amount_minor ?? 0)),
          declaredAmount: money(Number(e.declaredAmountMinor ?? e.declared_amount_minor ?? 0)),
          description: e.description ?? '',
          isEvasion: Boolean(e.isEvasion ?? e.is_evasion),
          occurredAt: new Date(e.occurredAt ?? e.occurred_at).toISOString(),
        })),
        totals: {
          revenue: money(Number(totals.revenue)),
          expense: money(Number(totals.expense)),
          declaredRevenue: money(Number(totals.declaredRevenue)),
          declaredExpense: money(Number(totals.declaredExpense)),
          profit: money(Number(totals.profit)),
          taxGap: money(Number(totals.taxGap)),
        },
      },
      filings: filings.map((f: any) => ({
        id: f.id,
        companyId: f.companyId ?? companyId,
        period: f.period,
        declaredRevenue: money(Number(f.declaredRevenueMinor ?? 0)),
        actualRevenue: money(Number(f.actualRevenueMinor ?? 0)),
        declaredExpense: money(Number(f.declaredExpenseMinor ?? 0)),
        actualExpense: money(Number(f.actualExpenseMinor ?? 0)),
        taxDue: money(Number(f.taxDueMinor ?? 0)),
        taxPaid: money(Number(f.taxPaidMinor ?? 0)),
        riskScore: Number(f.riskScore ?? 0),
        status: f.status,
        notes: f.notes ?? '',
        createdAt: new Date(f.createdAt).toISOString(),
        filedAt: f.filedAt ? new Date(f.filedAt).toISOString() : null,
      })),
    };
  }

  async createHiringPlan(
    userId: string,
    companyId: string,
    input: { roleFocus: string; headcount: number; budgetMinor?: number; context?: string },
  ): Promise<HiringPlanDto> {
    return withTransaction(async (client) => {
      const { character, company } = await this.assertOwner(client, userId, companyId);
      await this.requireActiveLicense(client, companyId);
      const { data } = await callAiService<any>('/v1/recruitment/propose', {
        company_id: companyId,
        company_name: company.name,
        industry: company.industry,
        role_focus: input.roleFocus,
        headcount: input.headcount,
        budget_minor: input.budgetMinor ?? Number(company.cashMinor),
        context: input.context ?? '',
      });
      const rationale =
        data?.rationale ?? 'AI đề xuất danh sách ứng viên, chờ chủ doanh nghiệp duyệt.';
      const candidates: any[] = Array.isArray(data?.candidates) ? data.candidates : [];
      const aiModel = data?.meta?.model ?? null;
      const planId = await this.repository.createHiringPlan(client, {
        companyId,
        requestedBy: character.id,
        roleFocus: input.roleFocus,
        headcount: input.headcount,
        rationale,
        aiModel,
      });
      for (const c of candidates.slice(0, input.headcount)) {
        await this.repository.addHiringCandidate(client, {
          planId,
          fullName: String(c.full_name ?? c.fullName ?? 'Ứng viên'),
          roleTitle: String(c.role_title ?? c.roleTitle ?? input.roleFocus),
          seniority: String(c.seniority ?? 'junior'),
          salaryMinor: Math.max(
            0,
            Number(c.proposed_salary_minor ?? c.proposedSalaryMinor ?? 8_000_000),
          ),
          fitScore: Math.max(0, Math.min(100, Number(c.fit_score ?? c.fitScore ?? 70))),
          riskNote: String(c.risk_note ?? c.riskNote ?? ''),
          reason: String(c.reason ?? c.aiReason ?? ''),
        });
      }
      await notify(client, {
        userId,
        kind: 'company',
        title: 'AI đề xuất tuyển dụng',
        body: `AI đã sắp xếp ${Math.min(candidates.length, input.headcount)} ứng viên cho "${company.name}". Vui lòng duyệt.`,
        payload: { companyId, planId },
      });
      const plan = await this.repository.getHiringPlan(planId, client);
      return this.mapHiringPlan(plan);
    });
  }

  async decideHiringCandidate(
    userId: string,
    companyId: string,
    planId: string,
    candidateId: string,
    decision: 'approved' | 'rejected',
  ): Promise<HiringPlanDto> {
    return withTransaction(async (client) => {
      await this.assertOwner(client, userId, companyId);
      const plan = await this.repository.getHiringPlan(planId, client);
      if (!plan || plan.companyId !== companyId) throw AppError.notFound('Kế hoạch tuyển dụng');
      if (plan.status === 'applied') throw AppError.badRequest('Kế hoạch đã được áp dụng.');
      const ok = await this.repository.decideHiringCandidate(client, planId, candidateId, decision);
      if (!ok) throw AppError.notFound('Ứng viên');
      const updated = await this.repository.getHiringPlan(planId, client);
      return this.mapHiringPlan(updated);
    });
  }

  async applyHiringPlan(userId: string, companyId: string, planId: string): Promise<HiringPlanDto> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      await this.requireActiveLicense(client, companyId);
      const plan = await this.repository.getHiringPlan(planId, client);
      if (!plan || plan.companyId !== companyId) throw AppError.notFound('Kế hoạch tuyển dụng');
      if (plan.status === 'applied') throw AppError.badRequest('Kế hoạch đã được áp dụng.');
      const hired = await this.repository.applyHiringPlan(client, planId);
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Đã tuyển nhân sự (AI đề xuất)',
        body: `Đã tuyển ${hired} ứng viên đã duyệt cho "${company.name}".`,
        payload: { companyId, planId, hired },
      });
      const updated = await this.repository.getHiringPlan(planId, client);
      return this.mapHiringPlan(updated);
    });
  }

  async fireStaff(userId: string, companyId: string, staffId: string): Promise<void> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      const ok = await this.repository.fireStaff(client, companyId, staffId);
      if (!ok) throw AppError.notFound('Nhân sự');
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Sa thải nhân sự (AI-tuyển)',
        body: `Đã chấm dứt hợp đồng nhân sự tại "${company.name}".`,
        payload: { companyId, staffId },
      });
    });
  }

  async addLedgerEntry(
    userId: string,
    companyId: string,
    input: {
      entryType: string;
      amountMinor: number;
      declaredAmountMinor?: number;
      description?: string;
      isEvasion?: boolean;
      applyToCash?: boolean;
    },
  ): Promise<CompanyHrAccountingDto> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      await this.requireActiveLicense(client, companyId);
      const amountMinor = input.amountMinor;
      const declared = input.declaredAmountMinor ?? amountMinor;
      const isEvasion = Boolean(input.isEvasion || declared !== amountMinor);
      if (amountMinor < 0 || declared < 0) throw AppError.badRequest('Số tiền không hợp lệ.');
      if (input.applyToCash !== false) {
        if (input.entryType === 'revenue') {
          await this.repository.adjustCash(client, companyId, amountMinor);
        } else if (['opex', 'payroll', 'tax', 'fine', 'bribe', 'other'].includes(input.entryType)) {
          if (Number(company.cashMinor) < amountMinor) {
            throw AppError.conflict('insufficient_funds', 'Quỹ công ty không đủ.');
          }
          await this.repository.adjustCash(client, companyId, -amountMinor);
        }
      }
      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: input.entryType,
        amountMinor,
        declaredAmountMinor: declared,
        description: input.description ?? '',
        isEvasion,
      });
      return this.getHrAccounting(userId, companyId);
    });
  }

  async createTaxFiling(
    userId: string,
    companyId: string,
    input: {
      period: string;
      declareFull?: boolean;
      adjustmentDeclaredRevenue?: number;
      adjustmentDeclaredExpense?: number;
      notes?: string;
    },
  ): Promise<CompanyHrAccountingDto> {
    return withTransaction(async (client) => {
      await this.assertOwner(client, userId, companyId);
      await this.requireActiveLicense(client, companyId);
      const totals = await this.repository.ledgerTotals(companyId, client);
      let declaredRevenue = input.declareFull === false ? 0 : Number(totals.revenue);
      let declaredExpense = input.declareFull === false ? 0 : Number(totals.expense);
      if (typeof input.adjustmentDeclaredRevenue === 'number')
        declaredRevenue = Math.max(0, input.adjustmentDeclaredRevenue);
      if (typeof input.adjustmentDeclaredExpense === 'number')
        declaredExpense = Math.max(0, input.adjustmentDeclaredExpense);
      const actualRevenue = Number(totals.revenue);
      const actualExpense = Number(totals.expense);
      const taxable = Math.max(0, declaredRevenue - declaredExpense);
      const taxDueMinor = Math.round(taxable * 0.1);
      const hiddenRevenue = Math.max(0, actualRevenue - declaredRevenue);
      const inflatedExpense = Math.max(0, declaredExpense - actualExpense);
      const riskScore = Math.min(
        100,
        Math.round(
          (hiddenRevenue / Math.max(1, actualRevenue)) * 60 +
            (inflatedExpense / Math.max(1, actualExpense || 1)) * 30 +
            (input.declareFull === false ? 20 : 0),
        ),
      );
      await this.repository.createTaxFiling(client, {
        companyId,
        period: input.period,
        declaredRevenueMinor: declaredRevenue,
        actualRevenueMinor: actualRevenue,
        declaredExpenseMinor: declaredExpense,
        actualExpenseMinor: actualExpense,
        taxDueMinor,
        riskScore,
        notes:
          input.notes ??
          (riskScore >= 60
            ? 'Khai báo có dấu hiệu lệch soát thực tế (rủi ro kiểm toán cao).'
            : 'Khai báo đã ghi nhận.'),
      });
      return this.getHrAccounting(userId, companyId);
    });
  }
}

function formatMinor(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const corporationService = new CorporationService();

