import { AppError } from '../../shared/http/errors.js';
import type { PoolClient } from 'pg';
import { withTransaction, type Db } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId, resolveCharacterByCccd } from '../../shared/actors/character.js';
import { ledger, SYSTEM_GOVERNMENT_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund } from '../../shared/state-fund/stateFund.js';
import { notify } from '../notifications/notification.service.js';
import { type TaxOverviewExtDto, MoneySchema } from '@efls/contracts';
import { GAME_START_YEAR } from '@efls/domain';
import { loadCurrentSeasonEffects } from '../../shared/season/seasonEffects.js';
import { taxRepository } from './tax.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

/** Thuế suất cá nhân áp dụng trên thu nhập từ công việc (10%). */
const TAX_RATE = 0.1;

/** Phí/lệ phí cấp giấy phép kinh doanh (người chơi tự nộp). */
const LICENSE_ISSUE_FEE = 5_000_000;
/** Phạt khi bị tố cáo/xác minh kinh doanh không giấy phép (trừ từ quỹ công ty nếu có). */
const UNLICENSED_FINE = 20_000_000;

/**
 * Dịch vụ thuế cá nhân & tuân thủ giấy phép doanh nghiệp.
 * - Thuế cá nhân: tự quyết toán 1 lần/năm theo thu nhập từ công việc đang giữ (không gộp DN).
 * - Giấy phép DN: người chơi (chủ DN) tự cấp/xin cấp; phát hiện & tố cáo công ty không có giấy phép.
 */
export class TaxService {
  constructor(private readonly repository = taxRepository) {}

  async getOverview(userId: string, dbOverride?: Db): Promise<TaxOverviewExtDto> {
    // Tự động quyết toán thuế cá nhân năm hiện tại (1 lần/năm, theo năm game) dựa trên công việc đang giữ.
    if (!dbOverride) {
      return withTransaction(async (client) => {
        const character = await requireCharacterByUserId(client, userId);
        const currentYear = await this.getCurrentGameYear(client);
        await this.ensureAnnualPersonalTax(client, userId, character.id, currentYear);
        return this.buildOverview(userId, client);
      });
    }
    return this.buildOverview(userId, dbOverride);
  }

  private async getCurrentGameYear(db: Db): Promise<number> {
    const yearRow = await (db as any).query(`SELECT current_year FROM game_state WHERE id = 1`);
    return Number(yearRow.rows[0]?.current_year ?? GAME_START_YEAR);
  }

  private async buildOverview(userId: string, db: Db): Promise<TaxOverviewExtDto> {
    const character = await requireCharacterByUserId(db, userId);
    const [assessments, audits, licenses, ownedCompanyLicenses, unlicensedCompanies] = await Promise.all([
      this.repository.listAssessments(character.id, db),
      this.repository.listAudits(character.id, db),
      this.repository.listLicenses(character.id, db),
      this.repository.listOwnedCompanyLicenseStatuses(character.id, db),
      this.repository.listUnlicensedCompanies(db),
    ]);

    const totalDue = assessments
      .filter((a) => a.status === 'due')
      .reduce((sum, a) => sum + Number(a.taxDueMinor), 0);
    // Năm tính thuế theo năm game (mốc hệ thống 01/01/2000), không dùng năm thực tế
    const yearRow = await (db as any).query(`SELECT current_year FROM game_state WHERE id = 1`);
    const currentYear = Number(yearRow.rows[0]?.current_year ?? GAME_START_YEAR);
    const latestAudit = audits[0];
    const auditRisk = latestAudit?.riskScore ?? this.computeRisk(character.heat_level, 0, 0);
    const audited = (latestAudit?.status ?? 'none') !== 'open';

    return {
      assessments: assessments.map((a) => ({
        id: a.id,
        taxYear: a.taxYear,
        taxableIncome: money(Number(a.taxableIncomeMinor)),
        taxDue: money(Number(a.taxDueMinor)),
        status: a.status as 'due' | 'paid' | 'delinquent',
        dueAt: a.dueAt.toISOString(),
        paidAt: a.paidAt?.toISOString() ?? null,
      })),
      totalDue: money(totalDue),
      currentYear,
      auditRisk,
      audited,
      audits: audits.map((a) => ({
        id: a.id,
        taxYear: a.taxYear,
        riskScore: a.riskScore,
        status: a.status as 'open' | 'cleared' | 'penalized',
        penalty: money(Number(a.penaltyMinor)),
        createdAt: a.createdAt.toISOString(),
      })),
      licenses: licenses.map((l) => ({
        id: l.id,
        companyId: l.companyId,
        licenseType: l.licenseType,
        status: l.status as 'active' | 'suspended' | 'revoked',
        issuedAt: l.issuedAt.toISOString(),
        revokedAt: l.revokedAt?.toISOString() ?? null,
      })),
      ownedCompanyLicenses: ownedCompanyLicenses.map((c) => ({
        companyId: c.companyId,
        companyName: c.companyName,
        ownerCharacterId: c.ownerCharacterId,
        ownerName: c.ownerName,
        isOwner: true,
        hasActiveLicense: Boolean(c.hasActiveLicense),
        licenseId: c.licenseId,
        licenseStatus: (c.licenseStatus as 'active' | 'suspended' | 'revoked' | null) ?? null,
        licenseType: c.licenseType,
        issuedAt: c.issuedAt ? c.issuedAt.toISOString() : null,
      })),
      unlicensedCompanies: unlicensedCompanies.map((c) => ({
        companyId: c.companyId,
        companyName: c.companyName,
        ownerCharacterId: c.ownerCharacterId,
        ownerName: c.ownerName,
      })),
    };
  }

  /**
   * Thu nhập chịu thuế cá nhân = tổng thu nhập năm từ các công việc đang giữ (active employments).
   * Không gộp thu nhập/doanh thu doanh nghiệp.
   */
  private async computePersonalTaxableIncomeMinor(
    characterId: string,
    db: Db,
  ): Promise<{ taxable: number; jobsCount: number; annualByJob: Array<{ title: string; annualMinor: number }> }> {
    const jobs = await this.repository.listActiveEmployments(characterId, db);
    const annualByJob = jobs.map((j) => {
      const annualMinor = Math.max(0, Number(j.salaryMinor)) * 12;
      return { title: j.title, annualMinor };
    });
    const taxable = annualByJob.reduce((sum, j) => sum + j.annualMinor, 0);
    return { taxable, jobsCount: jobs.length, annualByJob };
  }

  /** Tự động quyết toán thuế cá nhân 1 lần/năm. */
  private async ensureAnnualPersonalTax(
    client: PoolClient,
    userId: string,
    characterId: string,
    taxYear: number,
  ): Promise<string | null> {
    const existing = await this.repository.getAssessmentForCharacterYear(characterId, taxYear, client);
    if (existing) return existing.id;

    const { taxable, jobsCount, annualByJob } = await this.computePersonalTaxableIncomeMinor(characterId, client);
    // Hiệu ứng mùa: thuế có thể tăng/giảm theo cấu hình mùa (seasonEffects.taxPct)
    const season = await loadCurrentSeasonEffects(client);
    const taxDue = Math.round(taxable * TAX_RATE * season.multipliers.tax);
    const assessmentId = await this.repository.createAssessment(client, characterId, taxYear, taxable, taxDue);

    if (!assessmentId) {
      const raced = await this.repository.getAssessmentForCharacterYear(characterId, taxYear, client);
      return raced?.id ?? null;
    }

    const detail =
      jobsCount > 0
        ? annualByJob.map((j) => `${j.title}: ${j.annualMinor.toLocaleString('vi-VN')} ₫/năm`).join('; ')
        : 'Không có công việc đang giữ';

    let autoPaid = false;
    if (taxDue > 0) {
      const balance = await ledger.getBalance(client, 'character', characterId);
      if (balance >= taxDue) {
        await creditStateFund(
          client,
          { ownerType: 'character', ownerId: characterId, kind: 'cash' },
          taxDue,
          {
            amountMinor: taxDue,
            reasonCode: 'personal_income_tax',
            description: `Quyết toán thuế cá nhân năm ${taxYear} (tự động) vào quỹ đất nước`,
            refType: 'tax_assessment',
            refId: assessmentId,
            actorType: 'system',
            ledgerKind: 'tax_payment',
            ledgerDescription: `Quyết toán thuế cá nhân năm ${taxYear} (tự động, từ thu nhập công việc)`,
          },
        );
        await this.repository.markPaid(client, assessmentId);
        autoPaid = true;
      }
    } else {
      await this.repository.markPaid(client, assessmentId);
      autoPaid = true;
    }

    await notify(client, {
      userId,
      kind: 'tax',
      title: autoPaid ? 'Quyết toán thuế cá nhân (tự động)' : 'Quyết toán thuế cá nhân: còn nợ',
      body:
        taxDue > 0
          ? autoPaid
            ? `Đã tự động quyết toán thuế năm ${taxYear}: ${taxDue.toLocaleString('vi-VN')} ₫ trên thu nhập công việc ${taxable.toLocaleString('vi-VN')} ₫/năm (${jobsCount} công việc đang giữ).`
            : `Đã lập quyết toán thuế năm ${taxYear}: ${taxDue.toLocaleString('vi-VN')} ₫ trên thu nhập công việc ${taxable.toLocaleString('vi-VN')} ₫/năm (${jobsCount} công việc đang giữ). Số dư không đủ, vui lòng nộp thuế.`
          : `Quyết toán thuế năm ${taxYear}: không phát sinh thuế từ công việc đang giữ.`,
      payload: { assessmentId, taxYear, taxable, taxDue, jobsCount, detail, autoPaid },
    });

    return assessmentId;
  }

  async assess(userId: string, _taxYear?: number): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const taxYear = await this.getCurrentGameYear(client);
      const existing = await this.repository.getAssessmentForCharacterYear(character.id, taxYear, client);
      if (existing) {
        throw AppError.conflict(
          'tax_already_settled',
          `Bạn đã quyết toán thuế cho năm ${taxYear} rồi.`,
        );
      }
      await this.ensureAnnualPersonalTax(client, userId, character.id, taxYear);
      return this.buildOverview(userId, client);
    });
  }

  async pay(userId: string, assessmentId: string): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const assessment = await this.repository.getAssessment(assessmentId, client);
      if (!assessment) throw AppError.notFound('Tax assessment');
      if (assessment.status !== 'due') {
        throw AppError.badRequest('Khoản thuế đã được nộp hoặc hết hiệu lực.');
      }
      const due = Number(assessment.taxDueMinor);
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < due) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền nộp thuế.');
      }
      await creditStateFund(
        client,
        { ownerType: 'character', ownerId: character.id, kind: 'cash' },
        due,
        {
          amountMinor: due,
          reasonCode: 'personal_income_tax',
          description: `Nộp thuế năm ${assessment.taxYear} vào quỹ đất nước`,
          refType: 'tax_assessment',
          refId: assessmentId,
          actorType: 'character',
          actorId: character.id,
          ledgerKind: 'tax_payment',
          ledgerDescription: `Nộp thuế năm ${assessment.taxYear}`,
        },
      );
      await this.repository.markPaid(client, assessmentId);
      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Nộp thuế thành công',
        body: `Đã nộp ${due.toLocaleString('vi-VN')} ₫ thuế năm ${assessment.taxYear}.`,
        payload: { assessmentId, due },
      });
      return this.buildOverview(userId, client);
    });
  }

  async startAudit(userId: string, taxYear: number): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const audits = await this.repository.listAudits(character.id, client);
      if (audits.some((a) => a.status === 'open')) {
        throw AppError.conflict('audit_open', 'Đang có một cuộc kiểm toán đang mở.');
      }
      const assessments = await this.repository.listAssessments(character.id, client);
      const delinquentCount = assessments.filter((a) => a.status === 'delinquent').length;
      const dueTotal = assessments
        .filter((a) => a.status === 'due')
        .reduce((sum, a) => sum + Number(a.taxDueMinor), 0);
      const riskScore = this.computeRisk(character.heat_level, delinquentCount, dueTotal);
      const auditId = await this.repository.createAudit(client, character.id, taxYear, riskScore);

      let penalty = 0;
      let status: 'cleared' | 'penalized' = 'cleared';
      if (riskScore >= 60 && dueTotal > 0) {
        status = 'penalized';
        penalty = Math.max(1_000_000, Math.round(dueTotal * 0.1));
        const balance = await ledger.getBalance(client, 'character', character.id);
        const payable = Math.min(penalty, balance);
        if (payable > 0) {
          await creditStateFund(
            client,
            { ownerType: 'character', ownerId: character.id, kind: 'cash' },
            payable,
            {
              amountMinor: payable,
              reasonCode: 'tax_audit_penalty',
              description: `Phạt kiểm toán thuế năm ${taxYear} vào quỹ đất nước`,
              refType: 'tax_audit',
              refId: auditId,
              actorType: 'system',
              ledgerKind: 'tax_penalty',
              ledgerDescription: `Phạt kiểm toán năm ${taxYear}`,
            },
          );
        }
        await client.query(
          `UPDATE characters
           SET heat_level = LEAST(100, heat_level + 8), updated_at = now()
           WHERE id = $1`,
          [character.id],
        );
      }
      await this.repository.resolveAudit(client, auditId, status, penalty);

      await notify(client, {
        userId,
        kind: 'tax',
        title: status === 'penalized' ? 'Kiểm toán: bị phạt' : 'Kiểm toán: đã cleared',
        body:
          status === 'penalized'
            ? `Rủi ro kiểm toán ${riskScore}/100, phạt ${penalty.toLocaleString('vi-VN')} ₫.`
            : `Rủi ro kiểm toán ${riskScore}/100, không có vấn đề.`,
        payload: { auditId, taxYear, riskScore, status, penalty },
      });
      return this.buildOverview(userId, client);
    });
  }

  /** Tố giác một nhân vật (chung). */
  async report(userId: string, target: { targetCccd?: string; targetCharacterId?: string }, reason: string): Promise<void> {
    await withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const targetRef = target.targetCccd
        ? await resolveCharacterByCccd(client, target.targetCccd, { requireAlive: false })
        : target.targetCharacterId
          ? await (async () => {
              const r = await client.query<{ id: string }>(`SELECT id FROM characters WHERE id = $1`, [target.targetCharacterId]);
              if (!r.rows[0]) throw AppError.notFound('Target character');
              return { id: r.rows[0].id, user_id: null as any, is_alive: true } as any;
            })()
          : null;
      if (!targetRef) throw AppError.badRequest('Thiếu mục tiêu tố giác.');
      const targetCharacterId = targetRef.id;
      if (targetCharacterId === character.id) {
        throw AppError.badRequest('Không thể tự tố giác.');
      }
      const targetRow = await client.query<{ id: string; user_id: string | null }>(
        `SELECT id, user_id FROM characters WHERE id = $1`,
        [targetCharacterId],
      );
      if (!targetRow.rows[0]) throw AppError.notFound('Target character');

      await client.query(
        `UPDATE characters
         SET heat_level = LEAST(100, heat_level + 3), updated_at = now()
         WHERE id = $1`,
        [targetCharacterId],
      );

      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Đã tố giác',
        body: `Tố giác của bạn đã được gửi tới cơ quan chức năng.`,
        payload: { targetCharacterId, reason },
      });
      if (targetRow.rows[0].user_id) {
        await notify(client, {
          userId: targetRow.rows[0].user_id,
          kind: 'law',
          title: 'Bạn bị tố giác',
          body: `Bạn bị tố giác vì lý do: ${reason}`,
          payload: { reporterId: character.id, reason },
        });
      }
    });
  }

  /** (a) Người chơi (chủ DN) tự cấp/xin cấp giấy phép kinh doanh cho công ty của mình. */
  async issueLicense(userId: string, companyId: string): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompanyBasic(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ công ty mới được cấp/xin cấp giấy phép.');
      }
      if (company.status === 'bankrupt') {
        throw AppError.badRequest('Công ty đã phá sản, không thể cấp giấy phép.');
      }
      const hasActive = await this.repository.companyHasActiveLicense(companyId, client);
      if (hasActive) {
        throw AppError.conflict('license_active', 'Công ty đã có giấy phép kinh doanh hoạt động.');
      }

      // Lệ phí cấp phép (trừ từ ví cá nhân chủ DN).
      const balance = await ledger.getBalance(client, 'character', character.id);
      if (balance < LICENSE_ISSUE_FEE) {
        throw AppError.conflict(
          'insufficient_funds',
          `Không đủ tiền nộp lệ phí cấp giấy phép (${LICENSE_ISSUE_FEE.toLocaleString('vi-VN')} ₫).`,
        );
      }
      await creditStateFund(
        client,
        { ownerType: 'character', ownerId: character.id, kind: 'cash' },
        LICENSE_ISSUE_FEE,
        {
          amountMinor: LICENSE_ISSUE_FEE,
          reasonCode: 'business_license_fee',
          description: `Lệ phí cấp giấy phép kinh doanh "${company.name}" vào quỹ đất nước`,
          refType: 'company',
          refId: companyId,
          actorType: 'character',
          actorId: character.id,
          ledgerKind: 'license_fee',
          ledgerDescription: `Lệ phí cấp giấy phép kinh doanh - ${company.name}`,
        },
      );

      const licenseId = await this.repository.issueLicense(client, companyId, 'Giấy phép kinh doanh');

      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Đã cấp giấy phép kinh doanh',
        body: `Công ty "${company.name}" đã được cấp giấy phép kinh doanh (lệ phí ${LICENSE_ISSUE_FEE.toLocaleString('vi-VN')} ₫).`,
        payload: { companyId, licenseId, fee: LICENSE_ISSUE_FEE },
      });

      return this.buildOverview(userId, client);
    });
  }

  /** (b) Tố cáo công ty kinh doanh không có giấy phép: tạo vụ án và xử phạt. */
  async reportUnlicensedCompany(userId: string, companyId: string, reason?: string): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const reporter = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompanyBasic(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId === reporter.id) {
        throw AppError.badRequest('Không thể tự tố cáo công ty của mình.');
      }
      const hasActive = await this.repository.companyHasActiveLicense(companyId, client);
      if (hasActive) {
        throw AppError.badRequest('Công ty đang có giấy phép kinh doanh hoạt động, không thể tố cáo thiếu giấy phép.');
      }

      const finalReason =
        (reason && reason.trim()) ||
        `Kinh doanh không có giấy phép hoạt động (công ty "${company.name}").`;

      // Tạo vụ án đối với chủ công ty (hành vi kinh doanh không giấy phép).
      const caseRes = await client.query<{ id: string }>(
        `INSERT INTO court_cases (id, defendant_id, plaintiff_type, crime_type, status, evidence_strength)
         VALUES (gen_random_uuid(), $1, 'government', 'operating_without_license', 'open', 70)
         RETURNING id`,
        [company.ownerCharacterId],
      );
      const caseId = caseRes.rows[0]!.id;

      // Tăng heat chủ công ty.
      await client.query(
        `UPDATE characters SET heat_level = LEAST(100, heat_level + 10), updated_at = now() WHERE id = $1`,
        [company.ownerCharacterId],
      );

      // Phạt từ quỹ công ty nếu có (chuyển về quỹ đất nước).
      const companyCash = Math.max(0, Number(company.cashMinor));
      const fine = Math.min(UNLICENSED_FINE, companyCash);
      if (fine > 0) {
        await client.query(
          `UPDATE companies SET cash_minor = GREATEST(0, cash_minor - $2::bigint), updated_at = now() WHERE id = $1`,
          [companyId, fine],
        );
        // Cập nhật ledger công ty nếu có tài khoản cash, rồi ghi nhận vào quỹ đất nước (government cash) + state_fund
        await client.query(
          `UPDATE ledger_accounts
              SET balance_minor = GREATEST(0, balance_minor - $3::bigint), updated_at = now()
            WHERE owner_type = 'company' AND owner_id = $1 AND kind = $2 AND currency = 'VND'`,
          [companyId, 'cash', fine],
        );
        await client.query(
          `INSERT INTO ledger_accounts (id, owner_type, owner_id, kind, currency, balance_minor)
           VALUES (gen_random_uuid(), 'government', $1, 'cash', 'VND', $2)
           ON CONFLICT (owner_type, owner_id, kind, currency)
           DO UPDATE SET balance_minor = ledger_accounts.balance_minor + EXCLUDED.balance_minor, updated_at = now()`,
          [SYSTEM_GOVERNMENT_ID, fine],
        );
        // record state_fund inflow
        await client.query(`INSERT INTO state_fund (id, balance_minor) VALUES (1,0) ON CONFLICT (id) DO NOTHING`);
        const sf = await client.query<{ balance_minor: string }>(`SELECT balance_minor FROM state_fund WHERE id=1 FOR UPDATE`);
        const nextSf = Number(sf.rows[0]?.balance_minor ?? 0) + fine;
        await client.query(`UPDATE state_fund SET balance_minor=$1, updated_at=now() WHERE id=1`, [nextSf]);
        await client.query(
          `INSERT INTO state_fund_transactions (id, amount_minor, balance_after, reason_code, description, ref_type, ref_id, actor_type, actor_id, meta)
           VALUES (gen_random_uuid(), $1, $2, 'unlicensed_company_fine', $3, 'company', $4, 'system', NULL, $5::jsonb)`,
          [fine, nextSf, `Phạt công ty kinh doanh không giấy phép "${company.name}" vào quỹ đất nước`, companyId, JSON.stringify({ caseId, companyName: company.name })],
        );
      }

      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Đã tố cáo công ty không có giấy phép',
        body: `Đã ghi nhận tố cáo công ty "${company.name}" kinh doanh không giấy phép. Vụ án đã được lập và xử phạt ban đầu ${fine.toLocaleString('vi-VN')} ₫ (nếu có quỹ).`,
        payload: { companyId, caseId, fine, reason: finalReason },
      });
      await notify(client, {
        userId: company.ownerUserId,
        kind: 'law',
        title: 'Bị tố cáo: kinh doanh không giấy phép',
        body: `Công ty "${company.name}" bị tố cáo kinh doanh không có giấy phép. Vụ án đã được mở (mã ${caseId}).${fine > 0 ? ` Bị phạt ${fine.toLocaleString('vi-VN')} ₫ từ quỹ công ty.` : ''}`,
        payload: { companyId, caseId, fine, reason: finalReason },
      });

      return this.buildOverview(userId, client);
    });
  }

  /** Thu hồi giấy phép kinh doanh (hủy giấy phép công ty) - chủ công ty. */
  async revokeLicense(userId: string, licenseId: string): Promise<TaxOverviewExtDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const license = await this.repository.getLicense(licenseId, client);
      if (!license) throw AppError.notFound('Business license');
      const company = await client.query<{ owner_character_id: string; name: string }>(
        `SELECT owner_character_id, name FROM companies WHERE id = $1`,
        [license.companyId],
      );
      if (!company.rows[0]) throw AppError.notFound('Company');
      if (company.rows[0].owner_character_id !== character.id) {
        throw AppError.forbidden('Chỉ chủ công ty mới được hủy giấy phép của mình.');
      }
      if (license.status === 'revoked') {
        throw AppError.badRequest('Giấy phép đã bị hủy.');
      }
      await this.repository.revokeLicense(client, licenseId);
      await notify(client, {
        userId,
        kind: 'tax',
        title: 'Hủy giấy phép',
        body: `Giấy phép kinh doanh của công ty "${company.rows[0].name}" đã bị hủy. Công ty cần được cấp lại giấy phép để hoạt động hợp lệ.`,
        payload: { licenseId, companyId: license.companyId },
      });
      return this.buildOverview(userId, client);
    });
  }

  private computeRisk(heatLevel: number, delinquentCount: number, dueTotal: number): number {
    let risk = heatLevel * 0.5 + delinquentCount * 15 + Math.min(30, dueTotal / 1_000_000);
    risk = Math.min(100, Math.max(0, Math.round(risk)));
    return risk;
  }
}

export const taxService = new TaxService();

