import { AppError } from '../../shared/http/errors.js';
import type { PoolClient } from 'pg';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId, resolveCharacterByCccd } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund } from '../../shared/state-fund/stateFund.js';
import { callAiService } from '../../shared/ai/aiClient.js';
import { notify } from '../notifications/notification.service.js';
import { loadCurrentSeasonEffects } from '../../shared/season/seasonEffects.js';
import { CONSTRUCTION_OPTIONS, GAME_START_YEAR, deriveCanonicalGameTime } from '@efls/domain';
import { realEstateRepository } from '../real-estate/real-estate.repository.js';
import { provinceLandRepository } from '../province-land/provinceLand.repository.js';
import {
  type CompanyDto,
  type CompanyEmployeesDto,
  type CompanyHrAccountingDto,
  type CompanyOverviewDto,
  type CompanyPremisesOptionsDto,
  type CreateCompanyRequest,
  type HiringPlanDto,
  MoneySchema,
} from '@efls/contracts';
import { corporationRepository } from './corporation.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function premisesFromRow(row: Awaited<ReturnType<typeof corporationRepository.listCompanies>>[number]): CompanyDto['premises'] {
  if (!row.premisesType) return null;
  return {
    type: row.premisesType as any,
    label: row.premisesNeedsReselection
      ? `${row.premisesLabel ?? 'Địa điểm công ty'} (cần chọn trụ sở mới)`
      : (row.premisesLabel ?? 'Địa điểm công ty'),
    provinceCode: row.premisesProvinceCode,
    corePropertyId: row.premisesCorePropertyId,
    provinceLandPropertyId: row.premisesProvinceLandPropertyId,
    companyPropertyId: row.premisesCompanyPropertyId,
    hostCompanyId: row.premisesHostCompanyId,
    hostCompanyName: row.premisesHostCompanyName,
    needsReselection: Boolean(row.premisesNeedsReselection),
    invalidReason: row.premisesInvalidReason ?? null,
  };
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
    revenueRetainPct: Number((row as any).revenueRetainPct ?? 0),
    ownerSalary: money(Number((row as any).ownerSalaryMinor ?? 0)),
    ownerEmploymentId: ((row as any).ownerEmploymentId ?? null) as any,
    premises: premisesFromRow(row),
  };
}

/** Chuẩn hoá danh sách cổ đông kèm tỉ lệ % và cờ chủ sở hữu/người xem. */
function toShareholderDtos(
  shareholders: Array<{ characterId: string; characterName: string; shares: number }>,
  ownerCharacterId: string,
  viewerCharacterId: string,
): Array<{
  characterId: string;
  characterName: string;
  shares: number;
  isOwner: boolean;
  isMe: boolean;
  percentage: number;
}> {
  const totalShares = shareholders.reduce((sum, s) => sum + Number(s.shares || 0), 0);
  return shareholders.map((s) => ({
    characterId: s.characterId,
    characterName: s.characterName,
    shares: Number(s.shares),
    isOwner: s.characterId === ownerCharacterId,
    isMe: s.characterId === viewerCharacterId,
    percentage: totalShares > 0 ? Math.round((Number(s.shares) / totalShares) * 10000) / 100 : 0,
  }));
}

/** Dịch vụ doanh nghiệp: thành lập, quản lý công ty, đầu tư vốn. */
export class CorporationService {
  constructor(private readonly repository = corporationRepository) {}

  private async syncOwnerEmploymentRole(
    client: any,
    company: { id: string; name: string; status: string; ownerCharacterId: string; ownerSalaryMinor?: string | number },
  ): Promise<{
    status: 'inactive' | 'active' | 'blocked_other_employment' | 'company_inactive' | 'unavailable';
    employmentId: string | null;
    hiredAt: Date | null;
    note: string | null;
  }> {
    const salaryMinor = Number(company.ownerSalaryMinor ?? 0);

    // Multi-company: lương chủ DN trả theo cấu hình công ty (không chiếm employment slot),
    // nên không tạo/khóa employment chủ DN và không chặn bởi việc làm khác.
    try {
      const active = await this.repository.getOwnerActiveEmployment(client, company.ownerCharacterId);
      if (active && active.isOwnerRole && active.companyId === company.id) {
        await this.repository.endOwnerEmployment(client, company.id).catch(() => {});
      } else {
        await client
          .query(`UPDATE companies SET owner_employment_id = NULL, updated_at = now() WHERE id = $1`, [company.id])
          .catch(() => {});
      }
    } catch (e: any) {
      if (e?.code !== '42703') throw e;
    }

    if (company.status === 'bankrupt') {
      return { status: 'company_inactive', employmentId: null, hiredAt: null, note: 'Công ty không còn hoạt động.' };
    }
    if (salaryMinor <= 0) {
      return { status: 'inactive', employmentId: null, hiredAt: null, note: 'Chưa cấu hình lương chủ doanh nghiệp.' };
    }
    return {
      status: 'active',
      employmentId: null,
      hiredAt: null,
      note: 'Đang nhận lương chủ DN từ quỹ công ty theo mỗi ngày game (hỗ trợ làm chủ nhiều công ty, không chiếm slot việc làm).',
    };
  }

  private ownerRoleStatusFromRow(row: any): 'inactive' | 'active' | 'blocked_other_employment' | 'company_inactive' | 'unavailable' {
    const salary = Number(row?.ownerSalaryMinor ?? 0);
    if (row?.status === 'bankrupt') return 'company_inactive';
    if (salary <= 0) return 'inactive';
    return 'active';
  }

  private async getOwnerRoleDto(client: any, companyId: string) {
    const snap = await this.repository.getOwnerRoleSnapshot(client, companyId);
    if (!snap) return undefined;
    const salaryMinor = Number(snap.ownerSalaryMinor ?? 0);
    let status: 'inactive' | 'active' | 'blocked_other_employment' | 'company_inactive' | 'unavailable' = 'inactive';
    let note: string | null = null;

    if (snap.companyStatus === 'bankrupt') {
      status = 'company_inactive';
      note = 'Công ty không còn hoạt động.';
    } else if (salaryMinor <= 0) {
      status = 'inactive';
      note = 'Chưa cấu hình lương chủ doanh nghiệp.';
    } else {
      status = 'active';
      note = 'Đang nhận lương chủ DN từ quỹ công ty theo mỗi ngày game (có thể nhận ở nhiều công ty, không chiếm slot việc làm).';
    }

    return {
      characterId: snap.ownerCharacterId,
      characterName: snap.ownerName,
      roleTitle: 'Chủ doanh nghiệp',
      salary: money(salaryMinor),
      status,
      employmentId: null,
      hiredAt: null,
      editable: true,
      note,
    };
  }

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
        ownerEmploymentStatus: this.ownerRoleStatusFromRow(c),
      })),
    };
  }

  async getCompany(userId: string, companyId: string): Promise<CompanyDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const company = await this.repository.getCompany(companyId, db);
    if (!company) throw AppError.notFound('Company');
    const [shareholders, ownerRole] = await Promise.all([
      this.repository.listShareholders(companyId),
      this.getOwnerRoleDto(db, companyId),
    ]);
    const totalShares = shareholders.reduce((sum, s) => sum + Number(s.shares || 0), 0);

    return {
      ...toCompanyDto(company),
      isOwner: company.ownerCharacterId === character.id,
      ownerEmploymentStatus: (ownerRole?.status ?? this.ownerRoleStatusFromRow(company)) as any,
      ownerEmploymentId: ownerRole?.employmentId ?? company.ownerEmploymentId ?? null,
      shareholders: shareholders.map((s) => ({
        characterId: s.characterId,
        characterName: s.characterName,
        shares: Number(s.shares),
        isOwner: s.characterId === company.ownerCharacterId,
        isMe: s.characterId === character.id,
        percentage: totalShares > 0 ? Math.round((Number(s.shares) / totalShares) * 10000) / 100 : 0,
      })),
    };
  }

  async getPremisesOptions(userId: string): Promise<CompanyPremisesOptionsDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listPremisesOptions(character.id, db);
    return {
      land: rows
        .filter((r) => r.type === 'land_core' || r.type === 'land_province')
        .map((r) => ({
          type: r.type,
          id: r.id,
          label: r.label,
          provinceCode: r.provinceCode,
          provinceName: r.provinceName,
          propertyType: r.propertyType,
          location: r.x != null && r.y != null ? { x: r.x, y: r.y } : null,
          hostCompanyId: r.hostCompanyId,
          hostCompanyName: r.hostCompanyName,
        })),
      companyProperties: rows
        .filter((r) => r.type === 'company_property')
        .map((r) => ({
          type: r.type,
          id: r.id,
          label: r.label,
          provinceCode: r.provinceCode,
          provinceName: r.provinceName,
          propertyType: r.propertyType,
          location: r.x != null && r.y != null ? { x: r.x, y: r.y } : null,
          hostCompanyId: r.hostCompanyId,
          hostCompanyName: r.hostCompanyName,
        })),
    };
  }

  /** Thành lập công ty mới: yêu cầu chọn địa điểm/cơ sở (đất nền hoặc BĐS thuộc công ty khác), trừ vốn, cấp 100% cổ phiếu cho chủ sở hữu. */
  async createCompany(
    userId: string,
    name: string,
    industry: string,
    initialCapitalMinor: number,
    premises: CreateCompanyRequest['premises'],
  ): Promise<CompanyDto> {
    if (!premises || !premises.type) {
      throw AppError.badRequest('Vui lòng chọn địa điểm/cơ sở để thành lập công ty (đất nền hoặc bất động sản thuộc công ty khác).');
    }

    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const cash = toMinor(character.cash_minor);
      if (cash < initialCapitalMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để thành lập công ty.');
      }

      // Xác định & khóa/chiếm giữ địa điểm trước (đảm bảo còn hợp lệ)
      let premisesRecord: { type: 'land_core' | 'land_province' | 'company_property'; provinceCode: string | null; corePropertyId: string | null; provinceLandPropertyId: string | null; companyPropertyId: string | null };
      let premisesBody = '';
      try {
        if (premises.type === 'land_core') {
          if (!premises.corePropertyId) throw new Error('MISSING_PREMISES_ID');
          premisesRecord = { type: 'land_core', provinceCode: '001', corePropertyId: premises.corePropertyId, provinceLandPropertyId: null, companyPropertyId: null };
          premisesBody = 'đất nền (Hà Nội)';
        } else if (premises.type === 'land_province') {
          if (!premises.provinceLandPropertyId) throw new Error('MISSING_PREMISES_ID');
          premisesRecord = { type: 'land_province', provinceCode: null, corePropertyId: null, provinceLandPropertyId: premises.provinceLandPropertyId, companyPropertyId: null };
          premisesBody = 'đất nền (tỉnh/thành)';
        } else if (premises.type === 'company_property') {
          if (!premises.companyPropertyId) throw new Error('MISSING_PREMISES_ID');
          premisesRecord = { type: 'company_property', provinceCode: null, corePropertyId: null, provinceLandPropertyId: null, companyPropertyId: premises.companyPropertyId };
          premisesBody = 'bất động sản thuộc công ty khác';
        } else {
          throw new Error('INVALID_PREMISES_TYPE');
        }
      } catch {
        throw AppError.badRequest('Địa điểm/cơ sở thành lập công ty không hợp lệ.');
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

      // Mốc thành lập theo thời gian game (đồng bộ kỳ tài chính/doanh thu/thuế).
      const gs = await client.query<{ current_day: string | number; current_year: string | number }>(
        `SELECT current_day, current_year FROM game_state WHERE id = 1`,
      );
      const curDay = Number(gs.rows[0]?.current_day ?? 0);
      const curYear = Number(gs.rows[0]?.current_year ?? GAME_START_YEAR);
      const gameTime = deriveCanonicalGameTime({ dayOfYear: Math.max(0, Math.floor(curDay)), year: Math.max(GAME_START_YEAR, Math.floor(curYear)) });

      const companyId = await this.repository.createCompany(client, {
        name,
        industry,
        ownerCharacterId: character.id,
        initialCapitalMinor,
        foundedGameYear: gameTime.year,
        foundedGameMonth: gameTime.month,
        premises: premisesRecord,
      });

      // Link/validate premises and claim if land
      try {
        if (premisesRecord.type === 'land_core' && premisesRecord.corePropertyId) {
          await this.repository.lockAndClaimCoreLandPremises(client, premisesRecord.corePropertyId, character.id, companyId);
          // Nếu chọn đất nền thô: tự động xây dựng trụ sở công ty (lấy tên công ty).
          await this.autoBuildCompanyHqOnCoreLandIfNeeded(client, character.id, premisesRecord.corePropertyId, name);
        } else if (premisesRecord.type === 'land_province' && premisesRecord.provinceLandPropertyId) {
          const claimed = await this.repository.lockAndClaimProvinceLandPremises(client, premisesRecord.provinceLandPropertyId, character.id, companyId);
          if (claimed.provinceCode) {
            premisesRecord.provinceCode = claimed.provinceCode;
            await client.query(`UPDATE companies SET premises_province_code = $2 WHERE id = $1`, [companyId, claimed.provinceCode]);
          }
          // Nếu chọn đất nền thô: tự động xây dựng trụ sở công ty (lấy tên công ty).
          await this.autoBuildCompanyHqOnProvinceLandIfNeeded(client, character.id, premisesRecord.provinceLandPropertyId, name);
        } else if (premisesRecord.type === 'company_property' && premisesRecord.companyPropertyId) {
          await this.repository.validateCompanyPropertyPremises(client, premisesRecord.companyPropertyId);
        }
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('CORE_LAND_PREMISES_UNAVAILABLE')) {
          throw AppError.conflict('premises_unavailable', 'Đất nền đã chọn không còn khả dụng để xây dựng công ty (phải là đất nền đang sở hữu, chưa xây dựng/hợp thửa/chưa dùng làm trụ sở).');
        }
        if (msg.includes('PROVINCE_LAND_PREMISES_UNAVAILABLE')) {
          throw AppError.conflict('premises_unavailable', 'Đất nền tỉnh/thành đã chọn không còn khả dụng để xây dựng công ty (phải là đất nền đang sở hữu, chưa xây dựng/hợp thửa/chưa dùng làm trụ sở).');
        }
        if (msg.includes('COMPANY_PROPERTY_PREMISES_UNAVAILABLE')) {
          throw AppError.conflict('premises_unavailable', 'Bất động sản của công ty khác đã chọn không còn khả dụng để đặt trụ sở (phải là BĐS đã xây dựng, thuộc công ty khác đang hoạt động).');
        }
        throw e;
      }

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
        body: `Bạn đã thành lập công ty "${name}" tại ${premisesBody} với vốn khởi điểm ${formatMinor(initialCapitalMinor)} VND.`,
        payload: { companyId, name, industry, initialCapitalMinor, premises: premisesRecord },
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

  /** Nạp vốn/Bơm quỹ công ty: chuyển từ ví cá nhân sang quỹ công ty (companies.cash_minor). */
  async investCompany(userId: string, companyId: string, amountMinor: number): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.status === 'bankrupt') {
        throw AppError.badRequest('Công ty đã giải thể/phá sản, không thể nạp vốn.');
      }
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw AppError.badRequest('Số tiền nạp vốn phải lớn hơn 0.');
      }

      const cash = toMinor(character.cash_minor);
      if (cash < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để nạp vốn vào công ty.');
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id, kind: 'cash' },
        to: { ownerType: 'company', ownerId: companyId, kind: 'cash' },
        amountMinor,
        kind: 'company_capital_injection',
        description: `Nạp vốn vào công ty ${company.name}`,
        referenceType: 'company',
        referenceId: companyId,
      });

      // Đồng bộ/đảm bảo quỹ công ty phản ánh đúng (ledger.sync cũng cập nhật, nhưng tăng tường minh an toàn)
      await this.repository.adjustCash(client, companyId, amountMinor);
      // Tăng nhẹ định giá theo vốn bơm thêm (phản ánh tăng năng lực tài chính)
      await client.query(
        `UPDATE companies SET valuation_minor = valuation_minor + $2::bigint, updated_at = now() WHERE id = $1`,
        [companyId, amountMinor],
      );

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Nạp vốn vào công ty',
        body: `Bạn đã nạp ${formatMinor(amountMinor)} VND vào quỹ công ty "${company.name}".`,
        payload: { companyId, amountMinor },
      });

      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw new Error('Company disappeared after capital injection');
      return {
        ...toCompanyDto(dto),
        isOwner: dto.ownerCharacterId === character.id,
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
      // Trả về danh sách cổ đông thật (chủ sở hữu được cấp cổ phiếu ban đầu)
      // thay vì mảng rỗng, để UI hiển thị đúng ngay sau khi niêm yết.
      const shareholders = await this.repository.listShareholders(companyId, client);
      return {
        ...toCompanyDto(dto),
        isOwner: true,
        shareholders: toShareholderDtos(shareholders, dto.ownerCharacterId, character.id),
      };
    });
  }

  /** (Đã tắt) Cổ tức thủ công: hệ thống tự động chia cổ tức theo kỳ 30 ngày sau khi khai/nộp thuế. */
  async payDividend(
    userId: string,
    companyId: string,
  ): Promise<{ disabled: true; message: string }> {
    await requireLivingCharacterByUserId(this.repository.db, userId);
    const company = await this.repository.getCompany(companyId);
    if (!company) throw AppError.notFound('Company');
    throw AppError.badRequest('Cổ tức thủ công đã được tắt. Hệ thống sẽ tự động chia cổ tức theo kỳ 30 ngày sau khi bạn khai và nộp thuế doanh nghiệp.');
  }

  private isRawBuildableLand(constructionOption: string | null | undefined, propertyType: string | null | undefined): boolean {
    const opt = String(constructionOption ?? '').trim().toLowerCase();
    const isUnbuilt = !opt || opt === 'none';
    return isUnbuilt && String(propertyType ?? '').toLowerCase() === 'land';
  }

  private async autoBuildCompanyHqOnCoreLandIfNeeded(
    client: PoolClient,
    characterId: string,
    propertyId: string,
    companyName: string,
  ): Promise<void> {
    const row = await realEstateRepository.findById(propertyId, client);
    if (!row) return;
    if (row.ownerCharacterId !== characterId) return;
    if (row.mergedIntoPropertyId || row.mergeGroupId) return;
    if (!this.isRawBuildableLand(row.constructionOption, row.propertyType)) return;
    if (row.status !== 'owned') return;

    const option = (CONSTRUCTION_OPTIONS.single ?? []).find((o) => o.id === 'company_hq');
    if (!option) return;
    const label = (companyName || '').trim() || option.label;
    const totalBaseValue = Number(row.currentValueMinor);
    const costMinor = Math.max(0, Math.round(totalBaseValue * 0.2));
    const balance = await ledger.getBalance(client, 'character', characterId);
    if (balance < costMinor) {
      throw AppError.conflict(
        'insufficient_funds',
        `Không đủ tiền để tự động xây dựng trụ sở công ty. Cần ${costMinor.toLocaleString('vi-VN')} ₫.`,
      );
    }

    if (costMinor > 0) {
      await creditStateFund(
        client,
        { ownerType: 'character', ownerId: characterId, kind: 'cash' },
        costMinor,
        {
          amountMinor: costMinor,
          reasonCode: 'property_construction_fee',
          description: `Phí/thuế xây dựng ${label} (trụ sở công ty, 1 ô) vào quỹ đất nước`,
          refType: 'property',
          refId: row.id,
          actorType: 'character',
          actorId: characterId,
          ledgerKind: 'property_construction',
          ledgerDescription: `Tự động xây dựng ${label} (trụ sở công ty)`,
        },
      );
    }

    const newCurrentValueMinor = Math.round(totalBaseValue * option.valueMultiplier);
    const newMonthlyRentMinor = Math.max(0, Math.round(newCurrentValueMinor * 0.005));
    await realEstateRepository.applyConstruction(client, {
      primaryId: row.id,
      memberIds: [],
      mergeGroupId: null,
      optionId: option.id,
      label,
      tier: 'single',
      multiplier: option.valueMultiplier,
      costMinor,
      newPropertyType: 'office',
      newCurrentValueMinor,
      newMonthlyRentMinor,
    });
  }

  private async autoBuildCompanyHqOnProvinceLandIfNeeded(
    client: PoolClient,
    characterId: string,
    propertyId: string,
    companyName: string,
  ): Promise<void> {
    const rows = await provinceLandRepository.findByIds(client, [propertyId]);
    const row = rows[0];
    if (!row) return;
    if (row.ownerCharacterId !== characterId) return;
    if (row.mergedIntoPropertyId || row.mergeGroupId) return;
    if (!this.isRawBuildableLand(row.constructionOption, row.propertyType)) return;
    if (row.status !== 'owned') return;

    const option = (CONSTRUCTION_OPTIONS.single ?? []).find((o) => o.id === 'company_hq');
    if (!option) return;
    const label = (companyName || '').trim() || option.label;
    const totalBaseValue = Number(row.currentValueMinor);
    const costMinor = Math.max(0, Math.round(totalBaseValue * 0.2));
    const balance = await ledger.getBalance(client, 'character', characterId);
    if (balance < costMinor) {
      throw AppError.conflict(
        'insufficient_funds',
        `Không đủ tiền để tự động xây dựng trụ sở công ty. Cần ${costMinor.toLocaleString('vi-VN')} ₫.`,
      );
    }

    if (costMinor > 0) {
      await creditStateFund(
        client,
        { ownerType: 'character', ownerId: characterId, kind: 'cash' },
        costMinor,
        {
          amountMinor: costMinor,
          reasonCode: 'province_land_construction_fee',
          description: `Phí/thuế xây dựng ${label} (trụ sở công ty, 1 ô) - ${row.provinceCode} vào quỹ đất nước`,
          refType: 'province_land_property',
          refId: row.id,
          actorType: 'character',
          actorId: characterId,
          ledgerKind: 'property_construction',
          ledgerDescription: `Tự động xây dựng ${label} (trụ sở công ty)`,
        },
      );
    }

    const newCurrentValueMinor = Math.round(totalBaseValue * option.valueMultiplier);
    const newMonthlyRentMinor = Math.max(0, Math.round(newCurrentValueMinor * 0.005));
    await provinceLandRepository.applyConstruction(client, {
      primaryId: row.id,
      memberIds: [],
      mergeGroupId: null,
      optionId: option.id,
      label,
      tier: 'single',
      multiplier: option.valueMultiplier,
      costMinor,
      newPropertyType: 'office',
      newCurrentValueMinor,
      newMonthlyRentMinor,
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
        salaryArrears: money(Number((e as any).salaryArrearsMinor ?? 0)),
        status: e.status,
        hiredAt: e.hiredAt.toISOString(),
        isOwnerRole: Boolean((e as any).isOwnerRole),
        salaryLastChangedAt: (e as any).salaryLastChangedAt ? new Date((e as any).salaryLastChangedAt).toISOString() : null,
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

  private async liquidateCompanyOnBankruptcy(
    client: import('pg').PoolClient,
    companyId: string,
    companyName: string,
  ): Promise<void> {
    // 1) Nếu công ty có mã niêm yết/sàn chứng khoán: hủy niêm yết, hoàn tiền lệnh mua đang treo, hủy lệnh, xóa dữ liệu thị trường và cổ phần sở hữu
    const tickerRes = await client.query<{ id: string; symbol: string }>(
      `SELECT id, symbol FROM stock_tickers WHERE company_id = $1 LIMIT 1`,
      [companyId],
    );
    const ticker = tickerRes.rows[0] ?? null;

    if (ticker) {
      // 1a) Hoàn tiền escrow cho các lệnh MUA đang mở/còn khớp dở
      const buyOrders = await client.query<{
        id: string;
        character_id: string;
        user_id: string | null;
        refund_minor: string;
      }>(
        `SELECT o.id, o.character_id, ch.user_id,
                ((o.amount - o.filled_amount) * o.price_minor)::bigint AS refund_minor
         FROM stock_orders o
         JOIN characters ch ON ch.id = o.character_id
         WHERE o.ticker_id = $1
           AND o.side = 'buy'
           AND o.status IN ('open', 'partially_filled')
           AND (o.amount - o.filled_amount) > 0`,
        [ticker.id],
      );
      for (const o of buyOrders.rows) {
        const refund = Number(o.refund_minor ?? 0);
        if (refund > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'character', ownerId: o.character_id },
            amountMinor: refund,
            kind: 'order_escrow_refund',
            description: `Hoàn tiền lệnh mua do công ty ${companyName} (${ticker.symbol}) phá sản/giải thể`,
            referenceType: 'order',
            referenceId: o.id,
          });
        }
        await client.query(
          `UPDATE stock_orders SET status = 'cancelled', updated_at = now() WHERE id = $1`,
          [o.id],
        );
        if (o.user_id) {
          await notify(client, {
            userId: o.user_id,
            kind: 'stock_market',
            title: 'Lệnh mua bị hủy do công ty phá sản',
            body: `Công ty "${companyName}" (${ticker.symbol}) đã phá sản/giải thể. Lệnh mua của bạn đã bị hủy${refund > 0 ? ` và hoàn ${refund.toLocaleString('vi-VN')} ₫` : ''}.`,
            payload: { companyId, tickerId: ticker.id, symbol: ticker.symbol, orderId: o.id, refundedMinor: refund },
          }).catch(() => {});
        }
      }

      // 1b) Hủy các lệnh BÁN đang mở/còn khớp dở (không giữ tiền escrow)
      await client.query(
        `UPDATE stock_orders
         SET status = 'cancelled', updated_at = now()
         WHERE ticker_id = $1 AND status IN ('open','partially_filled')`,
        [ticker.id],
      );

      // 1c) Thông báo cho tất cả người đang sở hữu cổ phiếu/cổ phần: cổ phiếu bị mất (gộp từ sàn và danh sách cổ đông công ty)
      const holders = await client.query<{ character_id: string; user_id: string | null; shares: string }>(
        `SELECT x.character_id, ch.user_id, SUM(x.shares)::bigint::text AS shares
         FROM (
           SELECT h.character_id, h.shares::bigint AS shares
           FROM stock_holdings h
           WHERE h.ticker_id = $1 AND h.shares > 0
           UNION ALL
           SELECT cs.holder_character_id AS character_id, cs.shares::bigint AS shares
           FROM company_shareholders cs
           WHERE cs.company_id = $2 AND cs.shares > 0
         ) x
         JOIN characters ch ON ch.id = x.character_id
         GROUP BY x.character_id, ch.user_id`,
        [ticker.id, companyId],
      );
      for (const h of holders.rows) {
        if (!h.user_id) continue;
        const shares = Number(h.shares ?? 0);
        await notify(client, {
          userId: h.user_id,
          kind: 'stock_market',
          title: 'Công ty phá sản - Cổ phiếu bị mất',
          body: `Công ty "${companyName}" (${ticker.symbol}) đã phá sản/giải thể. ${shares.toLocaleString('vi-VN')} cổ phiếu/cổ phần bạn đang sở hữu đã bị mất và công ty không còn giao dịch trên sàn chứng khoán.`,
          payload: { companyId, tickerId: ticker.id, symbol: ticker.symbol, sharesLost: shares },
        }).catch(() => {});
      }

      // 1d) Xóa dữ liệu thị trường/sàn chứng khoán của công ty
      await client.query(`DELETE FROM stock_trades WHERE ticker_id = $1`, [ticker.id]);
      await client.query(`DELETE FROM stock_orders WHERE ticker_id = $1`, [ticker.id]);
      await client.query(`DELETE FROM stock_holdings WHERE ticker_id = $1`, [ticker.id]);
      await client.query(`DELETE FROM stock_tickers WHERE id = $1`, [ticker.id]);
    }

    // 2) Xóa quyền sở hữu cổ phần công ty (cổ đông mất cổ phần), kết thúc nhân sự còn active, cập nhật trạng thái công ty
    // Trường hợp công ty chưa/không niêm yết: vẫn thông báo cho cổ đông (company_shareholders) nếu có
    if (!ticker) {
      const holders = await client.query<{ character_id: string; user_id: string | null; shares: string }>(
        `SELECT cs.holder_character_id AS character_id, ch.user_id, cs.shares::text AS shares
         FROM company_shareholders cs
         JOIN characters ch ON ch.id = cs.holder_character_id
         WHERE cs.company_id = $1 AND cs.shares > 0`,
        [companyId],
      );
      for (const h of holders.rows) {
        if (!h.user_id) continue;
        const shares = Number(h.shares ?? 0);
        await notify(client, {
          userId: h.user_id,
          kind: 'company',
          title: 'Công ty phá sản - Cổ phần bị mất',
          body: `Công ty "${companyName}" đã phá sản/giải thể. ${shares.toLocaleString('vi-VN')} cổ phần bạn đang sở hữu đã bị mất.`,
          payload: { companyId, sharesLost: shares },
        }).catch(() => {});
      }
    }

    await client.query(`DELETE FROM company_shareholders WHERE company_id = $1`, [companyId]);
    await client.query(
      `UPDATE employments SET status = 'fired', ended_at = COALESCE(ended_at, now())
       WHERE company_id = $1 AND status IN ('active','notice_pending')`,
      [companyId],
    );
    await client.query(
      `UPDATE companies SET status = 'bankrupt', ticker_symbol = NULL, updated_at = now() WHERE id = $1`,
      [companyId],
    );
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

      await this.liquidateCompanyOnBankruptcy(client, companyId, company.name);

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Giải thể công ty',
        body: `Công ty "${company.name}" đã được giải thể/phá sản. Dữ liệu công ty đã được gỡ khỏi thị trường và sàn chứng khoán (nếu có).`,
        payload: { companyId },
      });

      const dto = await this.repository.getCompanyAnyStatus(companyId, client);
      if (!dto) throw new Error('Company disappeared after dissolve');
      return { ...toCompanyDto(dto), isOwner: true, shareholders: [] };
    });
  }

  /** (Đã tắt) Ghi nhận doanh thu thủ công: doanh thu được hệ thống tự động tính/chốt theo chu kỳ 30 ngày game. */
  async collectRevenue(userId: string, companyId: string): Promise<CompanyDto> {
    await requireLivingCharacterByUserId(this.repository.db, userId);
    const company = await this.repository.getCompany(companyId);
    if (!company) throw AppError.notFound('Company');
    throw AppError.badRequest('Ghi nhận doanh thu thủ công đã được tắt. Doanh thu được hệ thống tự động tính và chuyển cho chủ sở hữu theo chu kỳ 30 ngày game.');
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
      // Gắn kỳ tháng game hiện tại để đồng bộ thời gian hệ thống (phục vụ kê khai thuế/cổ tức theo kỳ).
      const gs = await client.query<{ current_day: string | number; current_year: string | number }>(
        `SELECT current_day, current_year FROM game_state WHERE id = 1`,
      );
      const curDay = Number(gs.rows[0]?.current_day ?? 0);
      const curYear = Number(gs.rows[0]?.current_year ?? GAME_START_YEAR);
      const gameTime = deriveCanonicalGameTime({ dayOfYear: Math.max(0, Math.floor(curDay)), year: Math.max(GAME_START_YEAR, Math.floor(curYear)) });
      const periodKey = `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}`;

      await this.repository.adjustCash(client, companyId, -amountMinor);
      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: 'opex',
        amountMinor,
        declaredAmountMinor: amountMinor,
        description: note ?? 'Chi OPEX',
        isEvasion: false,
        ledgerKind: 'MANUAL',
        periodKey,
      } as any);
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
    const [staff, entries, totals, filings, settlements, ownerRole, payrollForecastRaw] = await Promise.all([
      this.repository.listCompanyStaff(companyId, db),
      this.repository.listLedgerEntries(companyId, 100, db),
      this.repository.ledgerTotals(companyId, db),
      this.repository.listTaxFilings(companyId, db),
      this.repository.listRevenueSettlements(companyId, 24, db),
      this.getOwnerRoleDto(db, companyId),
      this.repository.getPayrollForecast(companyId, db),
    ]);
    const ownerStaffEntry = ownerRole
      ? [{
          id: `owner-role:${companyId}`,
          fullName: ownerRole.characterName,
          roleTitle: ownerRole.roleTitle,
          salary: ownerRole.salary,
          salaryArrears: money(0),
          status: (ownerRole.status === 'active' ? 'active' : 'resigned') as 'active' | 'resigned' | 'fired',
          hiredAt: ownerRole.hiredAt ?? company.foundedAt.toISOString(),
          firedAt: null as string | null,
          isOwnerRole: true,
          employmentId: ownerRole.employmentId ?? null,
          characterId: ownerRole.characterId,
          editableSalary: true,
          note: ownerRole.note ?? null,
          salaryLastChangedAt: null as string | null,
        }]
      : [];

    const payrollForecast = {
      employeeMonthly: money(Number(payrollForecastRaw.employeeMonthlyMinor ?? 0)),
      staffMonthly: money(Number(payrollForecastRaw.staffMonthlyMinor ?? 0)),
      ownerMonthly: money(Number(payrollForecastRaw.ownerMonthlyMinor ?? 0)),
      totalMonthly: money(
        Number(payrollForecastRaw.employeeMonthlyMinor ?? 0) +
          Number(payrollForecastRaw.staffMonthlyMinor ?? 0) +
          Number(payrollForecastRaw.ownerMonthlyMinor ?? 0),
      ),
      totalArrears: money(
        Number(payrollForecastRaw.employeeArrearsMinor ?? 0) +
          Number(payrollForecastRaw.staffArrearsMinor ?? 0),
      ),
      employeeArrears: money(Number(payrollForecastRaw.employeeArrearsMinor ?? 0)),
      staffArrears: money(Number(payrollForecastRaw.staffArrearsMinor ?? 0)),
    };

    return {
      companyId,
      // Gợi ý AI là phiên tạm (hiển thị khi bấm Đề xuất), không lưu trữ lâu dài
      plans: [],
      staff: [
        ...ownerStaffEntry,
        ...staff.map((s: any) => ({
          id: s.id,
          fullName: s.fullName ?? s.full_name,
          roleTitle: s.roleTitle ?? s.role_title,
          salary: money(Number(s.salaryMinor ?? s.salary_minor ?? 0)),
          salaryArrears: money(Number(s.salaryArrearsMinor ?? s.salary_arrears_minor ?? 0)),
          status: s.status,
          hiredAt: new Date(s.hiredAt ?? s.hired_at).toISOString(),
          firedAt: s.firedAt || s.fired_at ? new Date(s.firedAt ?? s.fired_at).toISOString() : null,
          isOwnerRole: false,
          employmentId: null,
          characterId: null,
          editableSalary: true, // owner có thể điều chỉnh lương AI staff (API hỗ trợ)
          note: null,
          salaryLastChangedAt: (s.salaryLastChangedAt ?? s.salary_last_changed_at)
            ? new Date(s.salaryLastChangedAt ?? s.salary_last_changed_at).toISOString()
            : null,
        })),
      ],
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
          ledgerKind: (e.ledgerKind ?? e.ledger_kind ?? 'MANUAL') as 'MANUAL' | 'ACTUAL',
          periodKey: e.periodKey ?? e.period_key ?? null,
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
        periodKey: f.periodKey ?? f.period_key ?? null,
        declaredRevenue: money(Number(f.declaredRevenueMinor ?? 0)),
        actualRevenue: money(Number(f.actualRevenueMinor ?? 0)),
        declaredExpense: money(Number(f.declaredExpenseMinor ?? 0)),
        actualExpense: money(Number(f.actualExpenseMinor ?? 0)),
        taxDue: money(Number(f.taxDueMinor ?? 0)),
        taxPaid: money(Number(f.taxPaidMinor ?? 0)),
        dividendPool: money(Number(f.dividendPoolMinor ?? f.dividend_pool_minor ?? 0)),
        dividendDistributed: money(Number(f.dividendDistributedMinor ?? f.dividend_distributed_minor ?? 0)),
        opexTotal: money(Number(f.opexTotalMinor ?? f.opex_total_minor ?? 0)),
        evasionGap: money(Number(f.evasionGapMinor ?? f.evasion_gap_minor ?? 0)),
        riskScore: Number(f.riskScore ?? 0),
        status: f.status,
        notes: f.notes ?? '',
        createdAt: new Date(f.createdAt).toISOString(),
        filedAt: f.filedAt ? new Date(f.filedAt).toISOString() : null,
        dividendDistributedAt: (f.dividendDistributedAt ?? f.dividend_distributed_at) ? new Date(f.dividendDistributedAt ?? f.dividend_distributed_at).toISOString() : null,
        auditCheckedAt: (f.auditCheckedAt ?? f.audit_checked_at) ? new Date(f.auditCheckedAt ?? f.audit_checked_at).toISOString() : null,
      })),
      revenueSettlements: settlements.map((s: any) => ({
        id: s.id,
        periodKey: s.periodKey ?? s.period_key,
        gameYear: Number(s.gameYear ?? s.game_year ?? 0),
        gameMonth: Number(s.gameMonth ?? s.game_month ?? 0),
        actualRevenue: money(Number(s.actualRevenueMinor ?? s.actual_revenue_minor ?? 0)),
        baseCapital: money(Number(s.baseCapitalMinor ?? s.base_capital_minor ?? 0)),
        monthlyRatePct: Number(s.monthlyRatePct ?? s.monthly_rate_pct ?? 0),
        seasonMultiplier: Number(s.seasonMultiplier ?? s.season_multiplier ?? 1),
        status: s.status ?? 'settled',
        settledAt: new Date(s.settledAt ?? s.settled_at).toISOString(),
        filed: Boolean(s.filed),
        filingStatus: s.filingStatus ?? s.filing_status ?? null,
        declaredRevenue: s.declaredRevenueMinor != null ? money(Number(s.declaredRevenueMinor)) : (s.declared_revenue_minor != null ? money(Number(s.declared_revenue_minor)) : null),
        taxPaid: s.taxPaidMinor != null ? money(Number(s.taxPaidMinor)) : (s.tax_paid_minor != null ? money(Number(s.tax_paid_minor)) : null),
      })),
      ownerRole,
      payrollForecast,
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
  ): Promise<HiringPlanDto | null> {
    return withTransaction(async (client) => {
      await this.assertOwner(client, userId, companyId);
      const plan = await this.repository.getHiringPlan(planId, client);
      if (!plan || plan.companyId !== companyId) throw AppError.notFound('Kế hoạch tuyển dụng');
      if (plan.status === 'applied') throw AppError.badRequest('Kế hoạch đã được áp dụng.');
      const ok = await this.repository.decideHiringCandidate(client, planId, candidateId, decision);
      if (!ok) throw AppError.notFound('Ứng viên');
      if (decision === 'rejected') {
        await this.repository.cleanupEmptyHiringPlan(client, planId);
      }
      const updated = await this.repository.getHiringPlan(planId, client);
      return updated ? this.mapHiringPlan(updated) : null;
    });
  }

  async applyHiringPlan(userId: string, companyId: string, planId: string): Promise<{ hired: number; plan: null }> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      await this.requireActiveLicense(client, companyId);
      const plan = await this.repository.getHiringPlan(planId, client);
      if (!plan || plan.companyId !== companyId) throw AppError.notFound('Kế hoạch tuyển dụng');
      if (plan.status === 'applied') throw AppError.badRequest('Kế hoạch đã được áp dụng.');
      const hired = await this.repository.applyHiringPlan(client, planId);
      if (hired <= 0) {
        throw AppError.badRequest('Chưa có ứng viên nào được duyệt để tuyển. Hãy duyệt ít nhất một ứng viên rồi bấm "Áp dụng tuyển".');
      }
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Đã tuyển nhân sự (AI đề xuất)',
        body: `Đã tuyển ${hired} ứng viên đã duyệt cho "${company.name}".`,
        payload: { companyId, planId, hired },
      });
      // Phiên gợi ý bị xóa sau khi tuyển thành công (không lưu trữ lâu dài)
      return { hired, plan: null };
    });
  }

  async dismissHiringPlan(userId: string, companyId: string, planId: string): Promise<void> {
    return withTransaction(async (client) => {
      await this.assertOwner(client, userId, companyId);
      const plan = await this.repository.getHiringPlan(planId, client);
      if (!plan || plan.companyId !== companyId) throw AppError.notFound('Kế hoạch tuyển dụng');
      await this.repository.deleteHiringPlan(client, planId);
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

  async updateEmployeeSalary(
    userId: string,
    companyId: string,
    employmentId: string,
    newSalaryMinor: number,
    reason?: string,
  ): Promise<CompanyHrAccountingDto> {
    if (!Number.isFinite(newSalaryMinor)) throw AppError.badRequest('Mức lương không hợp lệ.');
    const normalized = Math.max(0, Math.floor(newSalaryMinor));
    if (normalized > 1_000_000_000_000) throw AppError.badRequest('Mức lương vượt quá giới hạn cho phép.');

    return withTransaction(async (client) => {
      const { character } = await this.assertOwner(client, userId, companyId);
      const emp = await this.repository.getEmploymentForCompany(client, companyId, employmentId);
      if (!emp) throw AppError.notFound('Employment');
      if (emp.status !== 'active') throw AppError.badRequest('Chỉ có thể điều chỉnh lương cho nhân viên đang làm việc.');
      if (emp.isOwnerRole) {
        throw AppError.badRequest('Vui lòng sử dụng chức năng cấu hình lương chủ doanh nghiệp.');
      }

      const oldSalary = Math.max(0, Number(emp.salaryMinor ?? 0));
      if (normalized > oldSalary && oldSalary > 0 && normalized > oldSalary * 3) {
        throw AppError.badRequest('Mức tăng lương vượt quá giới hạn cho mỗi lần điều chỉnh (tối đa +200%).');
      }

      await this.repository.updateEmploymentSalary(client, employmentId, normalized);
      await this.repository.recordPayrollAdjustment(client, {
        companyId,
        targetType: 'employment',
        targetId: employmentId,
        oldSalaryMinor: oldSalary,
        newSalaryMinor: normalized,
        changedByCharacterId: character.id,
        reason: reason?.trim() || null,
        meta: { characterId: emp.characterId },
      });

      return this.getHrAccounting(userId, companyId);
    });
  }

  async updateStaffSalary(
    userId: string,
    companyId: string,
    staffId: string,
    newSalaryMinor: number,
    reason?: string,
  ): Promise<CompanyHrAccountingDto> {
    if (!Number.isFinite(newSalaryMinor)) throw AppError.badRequest('Mức lương không hợp lệ.');
    const normalized = Math.max(0, Math.floor(newSalaryMinor));
    if (normalized > 1_000_000_000_000) throw AppError.badRequest('Mức lương vượt quá giới hạn cho phép.');

    return withTransaction(async (client) => {
      const { character } = await this.assertOwner(client, userId, companyId);
      const staff = await this.repository.getStaffForCompany(client, companyId, staffId);
      if (!staff) throw AppError.notFound('Staff');
      if (staff.status !== 'active') throw AppError.badRequest('Chỉ có thể điều chỉnh lương cho nhân sự AI đang làm việc.');

      const oldSalary = Math.max(0, Number(staff.salaryMinor ?? 0));
      if (normalized > oldSalary && oldSalary > 0 && normalized > oldSalary * 3) {
        throw AppError.badRequest('Mức tăng lương vượt quá giới hạn cho mỗi lần điều chỉnh (tối đa +200%).');
      }

      await this.repository.updateStaffSalary(client, staffId, normalized);
      await this.repository.recordPayrollAdjustment(client, {
        companyId,
        targetType: 'staff',
        targetId: staffId,
        oldSalaryMinor: oldSalary,
        newSalaryMinor: normalized,
        changedByCharacterId: character.id,
        reason: reason?.trim() || null,
      });

      return this.getHrAccounting(userId, companyId);
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

      // Doanh thu thủ công bị tắt (chu kỳ 30 ngày tự động). Không cho ghi bút toán revenue thủ công.
      if (input.entryType === 'revenue') {
        throw AppError.badRequest('Ghi nhận doanh thu thủ công đã được tắt. Doanh thu được hệ thống tự động tính theo chu kỳ 30 ngày game.');
      }

      const amountMinor = Math.max(0, Math.trunc(input.amountMinor));
      const declared = Math.max(0, Math.trunc(input.declaredAmountMinor ?? amountMinor));
      const isEvasion = Boolean(input.isEvasion || declared !== amountMinor);
      if (amountMinor < 0 || declared < 0) throw AppError.badRequest('Số tiền không hợp lệ.');

      if (input.applyToCash !== false) {
        if (['opex', 'payroll', 'tax', 'fine', 'bribe', 'other', 'adjustment'].includes(input.entryType)) {
          const cashNow = Number((await this.repository.getCompany(companyId, client))?.cashMinor ?? company.cashMinor ?? 0);
          if (cashNow < amountMinor) {
            throw AppError.conflict('insufficient_funds', 'Quỹ công ty không đủ.');
          }
          await this.repository.adjustCash(client, companyId, -amountMinor);
        }
      }

      // Gắn kỳ tháng game hiện tại để đồng bộ chi phí/bút toán thủ công theo thời gian hệ thống.
      const gs = await client.query<{ current_day: string | number; current_year: string | number }>(
        `SELECT current_day, current_year FROM game_state WHERE id = 1`,
      );
      const curDay = Number(gs.rows[0]?.current_day ?? 0);
      const curYear = Number(gs.rows[0]?.current_year ?? GAME_START_YEAR);
      const gameTime = deriveCanonicalGameTime({ dayOfYear: Math.max(0, Math.floor(curDay)), year: Math.max(GAME_START_YEAR, Math.floor(curYear)) });
      const periodKey = `${gameTime.year}-${String(gameTime.month).padStart(2, '0')}`;

      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: input.entryType,
        amountMinor,
        declaredAmountMinor: declared,
        description: input.description ?? '',
        isEvasion,
        ledgerKind: 'MANUAL',
        periodKey,
      } as any);
      return this.getHrAccounting(userId, companyId);
    });
  }

  async createTaxFiling(
    userId: string,
    companyId: string,
    input: {
      period?: string;
      declaredRevenueMinor: number;
      usePersonalFundsForShortfall?: boolean;
      notes?: string;
    },
  ): Promise<CompanyHrAccountingDto> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      await this.requireActiveLicense(client, companyId);

      const declaredRevenue = Math.max(0, Math.trunc(input.declaredRevenueMinor));
      if (!Number.isFinite(declaredRevenue) || declaredRevenue < 0) {
        throw AppError.badRequest('Doanh thu khai báo không hợp lệ.');
      }

      // Xác định kỳ 30 ngày: ưu tiên period/periodKey truyền vào, nếu không lấy kỳ gần nhất đã chốt doanh thu thực tế
      const requestedKey = (input.period ?? '').trim() || null;
      const settlement = await this.repository.getSettlementForFiling(client, companyId, requestedKey);
      if (!settlement) {
        throw AppError.badRequest('Chưa có kỳ 30 ngày nào được hệ thống chốt doanh thu thực tế để khai thuế.');
      }
      const periodKey = String(settlement.period_key);
      const actualRevenue = Math.max(0, Number(settlement.actual_revenue_minor ?? 0));

      // 1 kỳ chỉ khai 1 lần (nộp thuế + chia cổ tức tự động)
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM company_tax_filings WHERE company_id = $1 AND period_key = $2 LIMIT 1`,
        [companyId, periodKey],
      );
      if (existing.rows[0]) {
        throw AppError.conflict('tax_filing_exists', `Kỳ ${periodKey} đã được khai/nộp thuế.`);
      }

      const periodExpenses = await this.repository.sumOperatingExpensesInPeriod(client, companyId, periodKey);
      const taxDueMinor = Math.round(declaredRevenue * 0.1);
      const dividendPool = declaredRevenue - taxDueMinor - periodExpenses;

      let companyCash = Number((await this.repository.getCompany(companyId, client))?.cashMinor ?? company.cashMinor ?? 0);
      const requiredTotal = taxDueMinor + (dividendPool > 0 ? dividendPool : 0);
      const shortfall = Math.max(0, requiredTotal - companyCash);
      const ownerChar = await requireLivingCharacterByUserId(client, userId);

      if (shortfall > 0) {
        if (!input.usePersonalFundsForShortfall) {
          if (companyCash < taxDueMinor) {
            throw AppError.conflict('insufficient_funds', `Quỹ công ty không đủ để nộp thuế kỳ ${periodKey}. Cần ${formatMinor(taxDueMinor)} (có thể chọn dùng ví cá nhân bù thiếu).`);
          }
          throw AppError.conflict('insufficient_funds', `Quỹ công ty không đủ để nộp thuế và chia cổ tức kỳ ${periodKey}. (Có thể chọn dùng ví cá nhân bù thiếu)`);
        }
        const ownerCash = toMinor(ownerChar.cash_minor);
        if (ownerCash < shortfall) {
          throw AppError.conflict('insufficient_funds', `Ví cá nhân không đủ để bù thiếu ${formatMinor(shortfall)} cho kỳ ${periodKey} (thuế + cổ tức).`);
        }
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: ownerChar.id, kind: 'cash' },
          to: { ownerType: 'company', ownerId: companyId, kind: 'cash' },
          amountMinor: shortfall,
          kind: 'company_tax_shortfall_cover',
          description: `Bù thiếu quỹ công ty cho kỳ ${periodKey} (thuế/cổ tức) từ ví cá nhân`,
          referenceType: 'company_tax_filing',
          referenceId: companyId,
        });
        // đảm bảo quỹ công ty phản ánh đủ (ledger có thể sync; cập nhật tường minh)
        await this.repository.adjustCash(client, companyId, shortfall);
        companyCash += shortfall;
      }

      if (companyCash < taxDueMinor) {
        throw AppError.conflict('insufficient_funds', `Quỹ công ty không đủ để nộp thuế kỳ ${periodKey}. Cần ${formatMinor(taxDueMinor)}.`);
      }
      if (dividendPool > 0 && companyCash < taxDueMinor + dividendPool) {
        throw AppError.conflict('insufficient_funds', `Quỹ công ty không đủ để nộp thuế và chia cổ tức kỳ ${periodKey}.`);
      }

      // Trừ thuế từ quỹ công ty
      if (taxDueMinor > 0) {
        await this.repository.adjustCash(client, companyId, -taxDueMinor);
      }
      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: 'tax',
        amountMinor: taxDueMinor,
        declaredAmountMinor: taxDueMinor,
        description: `Nộp thuế doanh nghiệp kỳ ${periodKey} (10% trên doanh thu khai báo)`,
        isEvasion: false,
        ledgerKind: 'ACTUAL',
        periodKey,
      } as any);

      // Tính rủi ro khai khống và cập nhật heat chủ sở hữu
      const evasionGap = Math.max(0, actualRevenue - declaredRevenue);
      const hiddenRatio = actualRevenue > 0 ? evasionGap / actualRevenue : 0;
      const riskScore = Math.min(100, Math.round(hiddenRatio * 100));
      if (evasionGap > 0) {
        const heatDelta = Math.max(1, Math.min(60, Math.round(riskScore / 2) + (hiddenRatio >= 0.5 ? 10 : 0)));
        await client.query(
          `UPDATE characters SET heat_level = LEAST(100, COALESCE(heat_level,0) + $2), updated_at = now() WHERE id = $1`,
          [company.ownerCharacterId, heatDelta],
        );
      }

      // Chia cổ tức tự động theo tỉ lệ cổ phần nếu có lợi nhuận sau thuế và OPEX kỳ
      let dividendDistributed = 0;
      let dividendRecipients = 0;
      if (dividendPool > 0) {
        const dist = await this.repository.distributeDividendPool(client, {
          companyId,
          poolMinor: dividendPool,
          periodKey,
        });
        dividendDistributed = dist.totalDistributedMinor;
        dividendRecipients = dist.recipientCount;
      }

      const status = dividendPool > 0 ? 'filed' : 'filed';
      const notesParts = [
        input.notes?.trim() || '',
        `Kỳ ${periodKey}: DT thực tế ${formatMinor(actualRevenue)}, DT khai ${formatMinor(declaredRevenue)}, thuế ${formatMinor(taxDueMinor)}, chi phí kỳ (OPEX+lương+khác) ${formatMinor(periodExpenses)}, quỹ cổ tức ${formatMinor(Math.max(0, dividendPool))}.`,
        dividendPool > 0 ? `Đã tự động chia cổ tức ${formatMinor(dividendDistributed)} cho ${dividendRecipients} cổ đông.` : 'Kỳ báo lỗ/không đủ quỹ chia cổ tức, không chia cổ tức.',
      ].filter(Boolean);

      await this.repository.createTaxFiling(client, {
        companyId,
        period: periodKey,
        periodKey,
        declaredRevenueMinor: declaredRevenue,
        actualRevenueMinor: actualRevenue,
        declaredExpenseMinor: periodExpenses,
        actualExpenseMinor: periodExpenses,
        taxDueMinor,
        taxPaidMinor: taxDueMinor,
        riskScore,
        status,
        notes: notesParts.join(' '),
        dividendPoolMinor: Math.max(0, dividendPool),
        dividendDistributedMinor: dividendDistributed,
        dividendDistributedAt: dividendPool > 0 ? new Date() : null,
        evasionGapMinor: evasionGap,
        opexTotalMinor: periodExpenses,
      } as any);

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Khai thuế & chốt kỳ 30 ngày',
        body: `Công ty "${company.name}" đã khai/nộp thuế kỳ ${periodKey}. Thuế: ${formatMinor(taxDueMinor)}.${dividendPool > 0 ? ` Cổ tức tự động: ${formatMinor(dividendDistributed)}.` : ' Không chia cổ tức (báo lỗ/không đủ quỹ).'}`,
        payload: { companyId, periodKey, declaredRevenue, actualRevenue, taxDueMinor, dividendPool: Math.max(0, dividendPool), dividendDistributed },
      });

      return this.getHrAccounting(userId, companyId);
    });
  }

  async relocatePremises(
    userId: string,
    companyId: string,
    premises: { type: 'land_core' | 'land_province' | 'company_property'; corePropertyId?: string; provinceLandPropertyId?: string; companyPropertyId?: string },
  ): Promise<CompanyDto> {
    if (!premises || !premises.type) {
      throw AppError.badRequest('Vui lòng chọn trụ sở/địa điểm mới cho công ty.');
    }

    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompanyAnyStatus(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (company.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được chọn/đổi trụ sở công ty.');
      }
      if (company.status === 'bankrupt') {
        throw AppError.badRequest('Công ty đã phá sản/giải thể, không thể chọn trụ sở.');
      }

      let premisesRecord: { type: 'land_core' | 'land_province' | 'company_property'; provinceCode: string | null; corePropertyId: string | null; provinceLandPropertyId: string | null; companyPropertyId: string | null };
      let premisesBody = '';
      if (premises.type === 'land_core') {
        if (!premises.corePropertyId) throw AppError.badRequest('Thiếu địa điểm đất nền (Hà Nội).');
        premisesRecord = { type: 'land_core', provinceCode: '001', corePropertyId: premises.corePropertyId, provinceLandPropertyId: null, companyPropertyId: null };
        premisesBody = 'đất nền/trụ sở (Hà Nội)';
      } else if (premises.type === 'land_province') {
        if (!premises.provinceLandPropertyId) throw AppError.badRequest('Thiếu địa điểm đất nền (tỉnh/thành).');
        premisesRecord = { type: 'land_province', provinceCode: null, corePropertyId: null, provinceLandPropertyId: premises.provinceLandPropertyId, companyPropertyId: null };
        premisesBody = 'đất nền/trụ sở (tỉnh/thành)';
      } else if (premises.type === 'company_property') {
        if (!premises.companyPropertyId) throw AppError.badRequest('Thiếu bất động sản của công ty khác.');
        premisesRecord = { type: 'company_property', provinceCode: null, corePropertyId: null, provinceLandPropertyId: null, companyPropertyId: premises.companyPropertyId };
        premisesBody = 'bất động sản thuộc công ty khác';
      } else {
        throw AppError.badRequest('Loại địa điểm trụ sở không hợp lệ.');
      }

      // Giải phóng claim cũ (nếu còn) trước khi claim mới
      await this.repository.releasePremisesClaim(client, companyId);

      try {
        if (premisesRecord.type === 'land_core' && premisesRecord.corePropertyId) {
          await this.repository.lockAndClaimCoreLandPremises(client, premisesRecord.corePropertyId, character.id, companyId);
          // Nếu chọn đất nền thô: tự động xây dựng trụ sở công ty (lấy tên công ty).
          await this.autoBuildCompanyHqOnCoreLandIfNeeded(client, character.id, premisesRecord.corePropertyId, company.name);
        } else if (premisesRecord.type === 'land_province' && premisesRecord.provinceLandPropertyId) {
          const claimed = await this.repository.lockAndClaimProvinceLandPremises(client, premisesRecord.provinceLandPropertyId, character.id, companyId);
          if (claimed.provinceCode) premisesRecord.provinceCode = claimed.provinceCode;
          // Nếu chọn đất nền thô: tự động xây dựng trụ sở công ty (lấy tên công ty).
          await this.autoBuildCompanyHqOnProvinceLandIfNeeded(client, character.id, premisesRecord.provinceLandPropertyId, company.name);
        } else if (premisesRecord.type === 'company_property' && premisesRecord.companyPropertyId) {
          await this.repository.validateCompanyPropertyPremises(client, premisesRecord.companyPropertyId);
        }
      } catch (e: any) {
        const msg = String(e?.message || '');
        if (msg.includes('CORE_LAND_PREMISES_UNAVAILABLE')) {
          throw AppError.conflict('premises_unavailable', 'Địa điểm đã chọn không còn khả dụng (phải là lô gốc đang sở hữu: đất trống hoặc trụ sở công ty đã xây, chưa bị chiếm dụng).');
        }
        if (msg.includes('PROVINCE_LAND_PREMISES_UNAVAILABLE')) {
          throw AppError.conflict('premises_unavailable', 'Địa điểm tỉnh/thành đã chọn không còn khả dụng (phải là lô gốc đang sở hữu: đất trống hoặc trụ sở công ty đã xây, chưa bị chiếm dụng).');
        }
        if (msg.includes('COMPANY_PROPERTY_PREMISES_UNAVAILABLE')) {
          throw AppError.conflict('premises_unavailable', 'Bất động sản của công ty khác đã chọn không còn khả dụng để đặt trụ sở.');
        }
        throw e;
      }

      await this.repository.relocatePremises(client, companyId, premisesRecord);

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Đã chọn trụ sở mới cho công ty',
        body: `Công ty "${company.name}" đã được đặt trụ sở mới tại ${premisesBody}.`,
        payload: { companyId, premises: premisesRecord },
      });

      const dto = await this.repository.getCompanyAnyStatus(companyId, client);
      if (!dto) throw new Error('Company disappeared after relocate premises');
      return { ...toCompanyDto(dto), isOwner: true };
    });
  }

  async setRevenueRetain(userId: string, companyId: string, retainPct: number): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      const pct = Math.max(0, Math.min(100, Number(retainPct)));
      await this.repository.setRevenueRetainPct(client, companyId, pct);
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Cập nhật tỉ lệ giữ lại doanh thu',
        body: `Công ty "${company.name}" sẽ giữ lại ${pct}% doanh thu tự động mỗi kỳ 30 ngày vào quỹ công ty (áp dụng từ các kỳ chốt tiếp theo).`,
        payload: { companyId, retainPct: pct },
      });
      const dto = await this.repository.getCompany(companyId, client);
      if (!dto) throw AppError.notFound('Company');
      const shareholders = await this.repository.listShareholders(companyId);
      const totalShares = shareholders.reduce((sum, s) => sum + Number(s.shares || 0), 0);
      return {
        ...toCompanyDto(dto),
        isOwner: true,
        shareholders: shareholders.map((s) => ({
          characterId: s.characterId,
          characterName: s.characterName,
          shares: Number(s.shares),
          isOwner: s.characterId === dto.ownerCharacterId,
          isMe: s.characterId === company.ownerCharacterId,
          percentage: totalShares > 0 ? Math.round((Number(s.shares) / totalShares) * 10000) / 100 : 0,
        })),
      };
    });
  }

  async setOwnerSalary(userId: string, companyId: string, salaryMinor: number): Promise<CompanyHrAccountingDto> {
    if (!Number.isFinite(salaryMinor) || salaryMinor < 0) {
      throw AppError.badRequest('Mức lương chủ doanh nghiệp không hợp lệ.');
    }
    const normalized = Math.floor(salaryMinor);
    try {
      return await withTransaction(async (client) => {
        const { company } = await this.assertOwner(client, userId, companyId);
        if (company.status === 'bankrupt') {
          throw AppError.badRequest('Công ty đã giải thể/phá sản, không thể cấu hình lương chủ doanh nghiệp.');
        }
        await this.repository.setOwnerSalary(client, companyId, normalized);
        const updated = await this.repository.getCompany(companyId, client);
        if (!updated) throw AppError.notFound('Company');
        await this.syncOwnerEmploymentRole(client, {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          ownerCharacterId: updated.ownerCharacterId,
          ownerSalaryMinor: normalized,
        });
        await notify(client, {
          userId,
          kind: 'company',
          title: normalized > 0 ? 'Đã cập nhật lương chủ doanh nghiệp' : 'Đã tắt lương chủ doanh nghiệp',
          body:
            normalized > 0
              ? `Công ty "${company.name}" đặt lương chủ doanh nghiệp là ${formatMinor(normalized)}/ngày game (chi từ quỹ công ty).`
              : `Công ty "${company.name}" đã tắt lương chủ doanh nghiệp.`,
          payload: { companyId, ownerSalaryMinor: normalized },
        }).catch(() => {});
        return this.getHrAccounting(userId, companyId);
      });
    } catch (e: any) {
      if (e?.code === '42703') {
        throw AppError.badRequest('Hệ thống chưa áp dụng migration cho lương chủ doanh nghiệp (0082). Vui lòng áp dụng migration DB rồi thử lại.');
      }
      throw e;
    }
  }

  async listShareOfferings(userId: string, companyId?: string): Promise<any[]> {
    await requireCharacterByUserId(this.repository.db, userId);
    const rows = await this.repository.listShareOfferings(this.repository.db, { companyId });
    return rows.map((o: any) => ({
      id: o.id,
      companyId: o.companyId,
      companyName: o.companyName,
      companyTicker: o.companyTicker ?? null,
      createdByCharacterId: o.createdByCharacterId,
      totalShares: Number(o.totalShares),
      remainingShares: Number(o.remainingShares),
      pricePerShare: money(Number(o.pricePerShareMinor)),
      status: o.status,
      startsAt: new Date(o.startsAt).toISOString(),
      endsAt: new Date(o.endsAt).toISOString(),
      createdAt: new Date(o.createdAt).toISOString(),
      closedAt: o.closedAt ? new Date(o.closedAt).toISOString() : null,
    }));
  }

  async createShareOffering(userId: string, companyId: string, input: { totalShares: number; pricePerShareMinor: number; durationHours: number }): Promise<any> {
    return withTransaction(async (client) => {
      const { company } = await this.assertOwner(client, userId, companyId);
      if (company.status !== 'ipo') {
        throw AppError.badRequest('Chỉ công ty đã IPO/niêm yết mới được tạo đợt chào bán cổ phần.');
      }
      const totalShares = Math.max(1, Math.trunc(Number(input.totalShares)));
      const price = Math.max(1, Math.trunc(Number(input.pricePerShareMinor)));
      const hours = Math.max(1, Math.trunc(Number(input.durationHours)));
      const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      const id = await this.repository.createShareOffering(client, {
        companyId,
        createdByCharacterId: company.ownerCharacterId,
        totalShares,
        pricePerShareMinor: price,
        endsAt,
      });
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Tạo đợt chào bán cổ phần',
        body: `Công ty "${company.name}" mở chào bán ${totalShares.toLocaleString('vi-VN')} CP giá ${formatMinor(price)}/CP (hạn ${hours}h).`,
        payload: { companyId, offeringId: id, totalShares, pricePerShareMinor: price, durationHours: hours },
      });
      const rows = await this.repository.listShareOfferings(client, { companyId });
      return rows.find((x: any) => x.id === id) ? (await this.listShareOfferings(userId, companyId)).find((x: any) => x.id === id) : { id, companyId };
    });
  }

  async buyShareOffering(userId: string, offeringId: string, shares: number): Promise<any> {
    return withTransaction(async (client) => {
      const buyer = await requireLivingCharacterByUserId(client, userId);
      const offering = await this.repository.getShareOfferingForUpdate(client, offeringId);
      if (!offering) throw AppError.notFound('Share offering');
      const now = Date.now();
      const endsAt = new Date(offering.endsAt).getTime();
      let status = offering.status as string;
      if (status === 'open' && (endsAt <= now || Number(offering.remainingShares) <= 0)) {
        status = Number(offering.remainingShares) <= 0 ? 'completed' : 'closed';
      }
      if (status !== 'open') {
        throw AppError.badRequest('Đợt chào bán không còn mở.');
      }
      if (String(offering.companyStatus) !== 'ipo') {
        throw AppError.badRequest('Công ty không còn ở trạng thái IPO.');
      }
      const qty = Math.max(1, Math.trunc(Number(shares)));
      const remaining = Number(offering.remainingShares);
      if (qty > remaining) {
        throw AppError.conflict('insufficient_shares', `Số cổ phần còn lại không đủ (còn ${remaining}).`);
      }
      const price = Number(offering.pricePerShareMinor);
      const totalCost = qty * price;
      const buyerCash = toMinor(buyer.cash_minor);
      if (buyerCash < totalCost) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để mua cổ phần.');
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: buyer.id, kind: 'cash' },
        to: { ownerType: 'company', ownerId: offering.companyId, kind: 'cash' },
        amountMinor: totalCost,
        kind: 'company_share_offering_purchase',
        description: `Mua ${qty} cổ phần chào bán (đợt ${offeringId})`,
        referenceType: 'company_share_offering',
        referenceId: offeringId,
      });

      // tăng cổ phần cho người mua (pha loãng tỉ lệ các cổ đông khác)
      await this.repository.upsertShareholder(client, offering.companyId, buyer.id, qty);

      // nếu có ticker thì cộng vào stock_holdings để có thể giao dịch trên thị trường
      const tickerRes = await client.query<{ id: string }>(
        `SELECT id FROM stock_tickers WHERE company_id = $1 LIMIT 1`,
        [offering.companyId],
      );
      const tickerId = tickerRes.rows[0]?.id;
      if (tickerId) {
        await client.query(
          `INSERT INTO stock_holdings (character_id, ticker_id, shares, avg_cost_minor, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (character_id, ticker_id)
           DO UPDATE SET
             avg_cost_minor = CASE
               WHEN COALESCE(stock_holdings.avg_cost_minor, 0) <= 0 OR stock_holdings.shares <= 0 THEN $4::bigint
               ELSE ROUND(((COALESCE(stock_holdings.avg_cost_minor, $4::bigint) * stock_holdings.shares) + ($4::bigint * $3))::numeric / GREATEST(stock_holdings.shares + $3, 1))::bigint
             END,
             shares = stock_holdings.shares + $3,
             updated_at = now()`,
          [buyer.id, tickerId, qty, price],
        );
      }

      // proceeds về quỹ công ty + điều chỉnh valuation theo proceeds
      await client.query(
        `UPDATE companies SET cash_minor = cash_minor + $2::bigint, valuation_minor = valuation_minor + $2::bigint, updated_at = now() WHERE id = $1`,
        [offering.companyId, totalCost],
      );

      await this.repository.recordOfferingPurchase(client, {
        offeringId,
        companyId: offering.companyId,
        buyerCharacterId: buyer.id,
        shares: qty,
        pricePerShareMinor: price,
        totalCostMinor: totalCost,
      });

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Mua cổ phần chào bán thành công',
        body: `Bạn đã mua ${qty.toLocaleString('vi-VN')} cổ phần của "${offering.companyName}" với tổng ${formatMinor(totalCost)}.`,
        payload: { offeringId, companyId: offering.companyId, shares: qty, totalCost },
      });

      const remainingAfter = remaining - qty;
      return {
        ok: true,
        offeringId,
        companyId: offering.companyId,
        sharesPurchased: qty,
        totalCost: money(totalCost),
        remainingShares: remainingAfter,
        status: remainingAfter <= 0 ? 'completed' : 'open',
      };
    });
  }

  // === Company Groups (Tập đoàn) ===
  private async buildGroupDto(db: any, group: any, viewerCharacterId: string): Promise<any> {
    const members = await this.repository.listCompanyGroupMembers(db, group.id);
    const memberDtos = await Promise.all(
      members.map(async (m: any) => {
        const ctrl = await this.repository.getCompanyControlForCharacter(db, m.companyId, viewerCharacterId).catch(() => ({ myShares: 0, totalShares: 0, controlPct: 0 }));
        const totalCtrl = await this.repository.getCompanyControlForCharacter(db, m.companyId, group.ownerCharacterId).catch(() => ({ myShares: 0, totalShares: 0, controlPct: Number(m.controlPct ?? 0) }));
        return {
          companyId: m.companyId,
          companyName: m.companyName,
          role: m.role,
          controlPct: Math.round((Number(totalCtrl.controlPct ?? m.controlPct ?? 0)) * 1000) / 1000,
          isHolding: m.role === 'holding' || m.companyId === group.holdingCompanyId,
          status: m.status,
          cash: money(Number(m.cashMinor ?? 0)),
          valuation: money(Number(m.valuationMinor ?? 0)),
          totalShares: totalCtrl.totalShares,
          myShares: ctrl.myShares,
        };
      }),
    );
    const totalCash = memberDtos.reduce((s, m) => s + (m.cash?.amount ?? 0), 0);
    const totalValuation = memberDtos.reduce((s, m) => s + (m.valuation?.amount ?? 0), 0);
    const isOwner = group.ownerCharacterId === viewerCharacterId;
    const visibleMembers = isOwner
      ? memberDtos
      : memberDtos.filter((m) => (m.myShares ?? 0) > 0 || m.companyId === group.holdingCompanyId && isOwner);
    // member-company owners can view their own company in this group
    const visibleForViewer = isOwner ? memberDtos : memberDtos.filter((m) => (m.myShares ?? 0) > 0 || m.isHolding);
    return {
      id: group.id,
      name: group.name,
      holdingCompanyId: group.holdingCompanyId,
      holdingCompanyName: group.holdingCompanyName,
      ownerCharacterId: group.ownerCharacterId,
      ownerName: group.ownerName ?? '',
      status: group.status,
      members: isOwner ? memberDtos : visibleForViewer,
      summary: {
        memberCount: memberDtos.length,
        totalCash: money(isOwner ? totalCash : visibleForViewer.reduce((s, m) => s + (m.cash?.amount ?? 0), 0)),
        totalValuation: money(isOwner ? totalValuation : visibleForViewer.reduce((s, m) => s + (m.valuation?.amount ?? 0), 0)),
      },
      createdAt: new Date(group.createdAt).toISOString(),
      updatedAt: group.updatedAt ? new Date(group.updatedAt).toISOString() : undefined,
      dissolvedAt: group.dissolvedAt ? new Date(group.dissolvedAt).toISOString() : null,
      isOwner,
    };
  }

  async getGroupOverview(userId: string): Promise<any> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const groupsRaw = await this.repository.listCompanyGroupsForCharacter(db, character.id);
    const groups = await Promise.all(groupsRaw.map((g: any) => this.buildGroupDto(db, g, character.id)));

    const eligibleHoldingCompanies = await this.repository.listEligibleHoldingCompanies(db, character.id);
    // eligible members: companies controlled >50% by character, active/ipo, not in any active group and not same as selected later (client filters), exclude bankrupt/merged
    const myCompanies = await this.repository.listCompanies();
    const eligibleMemberCompanies: any[] = [];
    for (const c of myCompanies as any[]) {
      if (!['active', 'ipo'].includes(c.status)) continue;
      const ctrl = await this.repository.getCompanyControlForCharacter(db, c.id, character.id);
      if (ctrl.controlPct <= 50) continue;
      const inGroup = await this.repository.findActiveGroupForCompany(db, c.id);
      if (inGroup) continue;
      eligibleMemberCompanies.push({ id: c.id, name: c.name, controlPct: Math.round(ctrl.controlPct * 100) / 100, groupId: null });
    }

    return {
      groups,
      eligibleHoldingCompanies: eligibleHoldingCompanies.map((c: any) => ({ id: c.id, name: c.name })),
      eligibleMemberCompanies,
    };
  }

  async getGroupDetail(userId: string, groupId: string): Promise<any> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const group = await this.repository.getCompanyGroupById(db, groupId);
    if (!group) throw AppError.notFound('Group');
    // access: owner or owner of any member company
    if (group.ownerCharacterId !== character.id) {
      const members = await this.repository.listCompanyGroupMembers(db, groupId);
      let allowed = false;
      for (const m of members) {
        const ctrl = await this.repository.getCompanyControlForCharacter(db, m.companyId, character.id);
        if (ctrl.myShares > 0) { allowed = true; break; }
      }
      if (!allowed) throw AppError.forbidden('Bạn không có quyền xem tập đoàn này.');
    }
    return this.buildGroupDto(db, group, character.id);
  }

  async createCompanyGroup(userId: string, name: string, holdingCompanyId: string): Promise<any> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const holding = await this.repository.getCompany(holdingCompanyId, client);
      if (!holding) throw AppError.notFound('Company');
      if (!['active', 'ipo'].includes(holding.status)) throw AppError.badRequest('Công ty mẹ phải đang hoạt động.');
      if (holding.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu công ty mẹ mới được tạo tập đoàn.');
      }
      const ctrl = await this.repository.getCompanyControlForCharacter(client, holdingCompanyId, character.id);
      if (ctrl.controlPct <= 50) throw AppError.badRequest('Cần kiểm soát trên 50% công ty mẹ.');
      const existing = await this.repository.findActiveGroupForCompany(client, holdingCompanyId);
      if (existing) throw AppError.conflict('company_in_group', 'Công ty mẹ đã thuộc một tập đoàn khác.');
      const cleanName = (name || '').trim();
      if (!cleanName) throw AppError.badRequest('Tên tập đoàn không hợp lệ.');
      const id = await this.repository.createCompanyGroup(client, {
        name: cleanName,
        holdingCompanyId,
        ownerCharacterId: character.id,
      });
      const group = await this.repository.getCompanyGroupById(client, id);
      return this.buildGroupDto(client, group, character.id);
    });
  }

  async renameCompanyGroup(userId: string, groupId: string, name: string): Promise<any> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const group = await this.repository.getCompanyGroupById(client, groupId);
      if (!group || group.status !== 'active') throw AppError.notFound('Group');
      if (group.ownerCharacterId !== character.id) throw AppError.forbidden('Chỉ chủ tập đoàn mới được đổi tên.');
      const cleanName = (name || '').trim();
      if (!cleanName) throw AppError.badRequest('Tên tập đoàn không hợp lệ.');
      await this.repository.renameCompanyGroup(client, groupId, cleanName);
      const updated = await this.repository.getCompanyGroupById(client, groupId);
      return this.buildGroupDto(client, updated, character.id);
    });
  }

  async dissolveCompanyGroup(userId: string, groupId: string): Promise<void> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const group = await this.repository.getCompanyGroupById(client, groupId);
      if (!group || group.status !== 'active') throw AppError.notFound('Group');
      if (group.ownerCharacterId !== character.id) throw AppError.forbidden('Chỉ chủ tập đoàn mới được giải tán.');
      await this.repository.dissolveCompanyGroup(client, groupId);
    });
  }

  async addCompanyGroupMember(userId: string, groupId: string, companyId: string): Promise<any> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const group = await this.repository.getCompanyGroupById(client, groupId);
      if (!group || group.status !== 'active') throw AppError.notFound('Group');
      if (group.ownerCharacterId !== character.id) throw AppError.forbidden('Chỉ chủ tập đoàn mới được thêm thành viên.');
      const company = await this.repository.getCompany(companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (!['active', 'ipo'].includes(company.status)) throw AppError.badRequest('Công ty phải đang hoạt động.');
      if (companyId === group.holdingCompanyId) throw AppError.badRequest('Công ty mẹ đã thuộc tập đoàn.');
      const ctrl = await this.repository.getCompanyControlForCharacter(client, companyId, character.id);
      if (ctrl.controlPct <= 50) throw AppError.badRequest('Cần kiểm soát trên 50% công ty để đưa vào tập đoàn.');
      const existing = await this.repository.findActiveGroupForCompany(client, companyId);
      if (existing) throw AppError.conflict('company_in_group', 'Công ty đã thuộc một tập đoàn.');
      await this.repository.addCompanyGroupMember(client, { groupId, companyId, controlPct: Math.round(ctrl.controlPct * 1000) / 1000 });
      const updated = await this.repository.getCompanyGroupById(client, groupId);
      return this.buildGroupDto(client, updated, character.id);
    });
  }

  async removeCompanyGroupMember(userId: string, groupId: string, companyId: string): Promise<any> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const group = await this.repository.getCompanyGroupById(client, groupId);
      if (!group || group.status !== 'active') throw AppError.notFound('Group');
      if (group.ownerCharacterId !== character.id) throw AppError.forbidden('Chỉ chủ tập đoàn mới được gỡ thành viên.');
      if (companyId === group.holdingCompanyId) throw AppError.badRequest('Không thể gỡ công ty mẹ khỏi tập đoàn.');
      const removed = await this.repository.removeCompanyGroupMember(client, groupId, companyId);
      if (!removed) throw AppError.notFound('Thành viên');
      const updated = await this.repository.getCompanyGroupById(client, groupId);
      return this.buildGroupDto(client, updated, character.id);
    });
  }

  // === Buyouts ===
  private async mapBuyoutOffer(db: any, o: any, viewerCharacterId: string): Promise<any> {
    const total = await this.repository.getCompanyControlForCharacter(db, o.companyId, '00000000-0000-0000-0000-000000000000').catch(() => ({ myShares: 0, totalShares: 0, controlPct: 0 }));
    const mine = await this.repository.getCompanyControlForCharacter(db, o.companyId, viewerCharacterId).catch(() => ({ myShares: 0, totalShares: 0, controlPct: 0 }));
    const acq = await this.repository.getCompanyControlForCharacter(db, o.companyId, o.acquirerCharacterId).catch(() => ({ myShares: 0, totalShares: 0, controlPct: 0 }));
    const status = (o.status === 'open' && new Date(o.endsAt).getTime() <= Date.now()) ? 'expired' : o.status;
    return {
      id: o.id,
      companyId: o.companyId,
      companyName: o.companyName,
      acquirerCharacterId: o.acquirerCharacterId,
      acquirerName: o.acquirerName ?? '',
      pricePerShare: money(Number(o.pricePerShareMinor ?? 0)),
      targetShares: Number(o.targetShares ?? 0),
      acquiredShares: Number(o.acquiredShares ?? 0),
      status,
      allowSqueezeOut: Boolean(o.allowSqueezeOut),
      startsAt: new Date(o.startsAt).toISOString(),
      endsAt: new Date(o.endsAt).toISOString(),
      createdAt: new Date(o.createdAt).toISOString(),
      closedAt: o.closedAt ? new Date(o.closedAt).toISOString() : null,
      isAcquirer: o.acquirerCharacterId === viewerCharacterId,
      myShares: mine.myShares,
      totalCompanyShares: total.totalShares,
      acquirerOwnedShares: acq.myShares,
      acquirerControlPct: Math.round(acq.controlPct * 100) / 100,
      canMerge: acq.myShares > 0 && total.totalShares > 0 && acq.myShares >= total.totalShares,
    };
  }

  async listBuyoutOffers(userId: string, companyId?: string): Promise<any> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const rows = await this.repository.listBuyoutOffers(db, { companyId });
    const offers = await Promise.all(rows.map((o: any) => this.mapBuyoutOffer(db, o, character.id)));
    return { offers };
  }

  async createBuyoutOffer(userId: string, input: { companyId: string; pricePerShareMinor: number; durationHours: number; allowSqueezeOut?: boolean }): Promise<any> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const company = await this.repository.getCompanyAnyStatus(input.companyId, client);
      if (!company) throw AppError.notFound('Company');
      if (!['active', 'ipo'].includes(company.status)) throw AppError.badRequest('Chỉ có thể tạo đề nghị mua lại công ty đang hoạt động/IPO.');
      const price = Math.max(1, Math.trunc(Number(input.pricePerShareMinor)));
      const hours = Math.max(1, Math.trunc(Number(input.durationHours || 24)));
      const total = await this.repository.getCompanyControlForCharacter(client, input.companyId, character.id);
      if (total.totalShares <= 0) throw AppError.badRequest('Công ty chưa có cổ phần để mua lại.');
      const endsAt = new Date(Date.now() + hours * 60 * 60 * 1000);
      const id = await this.repository.createBuyoutOffer(client, {
        companyId: input.companyId,
        acquirerCharacterId: character.id,
        pricePerShareMinor: price,
        targetShares: total.totalShares,
        endsAt,
        allowSqueezeOut: input.allowSqueezeOut !== false,
      });
      await notify(client, {
        userId,
        kind: 'company',
        title: 'Tạo đề nghị mua lại',
        body: `Đã tạo đề nghị mua lại cổ phần công ty "${company.name}" với giá ${formatMinor(price)}/CP.`,
        payload: { companyId: input.companyId, offerId: id, pricePerShareMinor: price },
      });
      const rows = await this.repository.listBuyoutOffers(client, { companyId: input.companyId });
      const row = rows.find((r: any) => r.id === id) ?? rows[0];
      return this.mapBuyoutOffer(client, row, character.id);
    });
  }

  async tenderBuyoutOffer(userId: string, offerId: string, shares?: number): Promise<any> {
    return withTransaction(async (client) => {
      const seller = await requireLivingCharacterByUserId(client, userId);
      const offer = await this.repository.getBuyoutOfferForUpdate(client, offerId);
      if (!offer) throw AppError.notFound('Buyout offer');
      const status = (offer.status === 'open' && new Date(offer.ends_at ?? offer.endsAt).getTime() <= Date.now()) ? 'expired' : offer.status;
      if (status !== 'open') throw AppError.badRequest('Đề nghị mua lại không còn mở.');
      if (String(offer.companyStatus) === 'merged' || String(offer.companyStatus) === 'bankrupt') throw AppError.badRequest('Công ty không còn khả dụng.');
      const companyId = offer.company_id ?? offer.companyId;
      const acquirerCharacterId = offer.acquirer_character_id ?? offer.acquirerCharacterId;
      if (acquirerCharacterId === seller.id) throw AppError.badRequest('Người mua lại không thể tự bán cho chính mình.');
      const myShares = await this.repository.getShareholderSharesForUpdate(client, companyId, seller.id);
      if (myShares <= 0) throw AppError.badRequest('Bạn không có cổ phần trong công ty này.');
      const qty = Math.max(1, Math.trunc(Number(shares ?? myShares)));
      if (qty > myShares) throw AppError.conflict('insufficient_shares', 'Số cổ phần bán vượt quá số bạn đang sở hữu.');
      const price = Number(offer.price_per_share_minor ?? offer.pricePerShareMinor);
      const totalCost = qty * price;
      // pay seller from acquirer cash
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: acquirerCharacterId, kind: 'cash' },
        to: { ownerType: 'character', ownerId: seller.id, kind: 'cash' },
        amountMinor: totalCost,
        kind: 'company_buyout_tender',
        description: `Bán ${qty} cổ phần theo đề nghị mua lại`,
        referenceType: 'company_buyout_offer',
        referenceId: offerId,
      });
      await this.repository.transferShares(client, companyId, seller.id, acquirerCharacterId, qty);
      await this.repository.recordBuyoutPurchase(client, {
        offerId,
        companyId,
        sellerCharacterId: seller.id,
        buyerCharacterId: acquirerCharacterId,
        shares: qty,
        pricePerShareMinor: price,
        totalCostMinor: totalCost,
        isSqueezeOut: false,
      });

      const total = await this.repository.getCompanyControlForCharacter(client, companyId, acquirerCharacterId);
      const all = await this.repository.getCompanyControlForCharacter(client, companyId, '00000000-0000-0000-0000-000000000000');
      const complete = all.totalShares > 0 && total.myShares >= all.totalShares;
      await this.repository.updateBuyoutOfferProgress(client, offerId, qty, complete);
      if (complete) {
        // set owner to acquirer
        await this.repository.transferOwnership(client, companyId, acquirerCharacterId);
      }

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Bán cổ phần (mua lại)',
        body: `Bạn đã bán ${qty.toLocaleString('vi-VN')} cổ phần và nhận ${formatMinor(totalCost)}.`,
        payload: { offerId, companyId, shares: qty, totalCost },
      }).catch(() => {});

      const rows = await this.repository.listBuyoutOffers(client, { companyId });
      const row = rows.find((r: any) => r.id === offerId) ?? rows[0];
      return this.mapBuyoutOffer(client, row, seller.id);
    });
  }

  async cancelBuyoutOffer(userId: string, offerId: string): Promise<void> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const offer = await this.repository.getBuyoutOfferForUpdate(client, offerId);
      if (!offer) throw AppError.notFound('Buyout offer');
      const acquirerCharacterId = offer.acquirer_character_id ?? offer.acquirerCharacterId;
      if (acquirerCharacterId !== character.id) throw AppError.forbidden('Chỉ người tạo đề nghị mới được hủy.');
      if (!['open', 'expired'].includes(offer.status)) throw AppError.badRequest('Không thể hủy đề nghị ở trạng thái hiện tại.');
      await this.repository.setBuyoutOfferStatus(client, offerId, 'cancelled');
    });
  }

  async squeezeOutBuyout(userId: string, offerId: string): Promise<any> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const offer = await this.repository.getBuyoutOfferForUpdate(client, offerId);
      if (!offer) throw AppError.notFound('Buyout offer');
      const acquirerCharacterId = offer.acquirer_character_id ?? offer.acquirerCharacterId;
      if (acquirerCharacterId !== character.id) throw AppError.forbidden('Chỉ người mua lại mới được thực hiện ép mua.');
      if (!offer.allow_squeeze_out && !offer.allowSqueezeOut) throw AppError.badRequest('Đề nghị này không cho phép ép mua cổ đông thiểu số.');
      const status = (offer.status === 'open' && new Date(offer.ends_at ?? offer.endsAt).getTime() <= Date.now()) ? 'expired' : offer.status;
      if (!['open', 'expired', 'completed'].includes(status)) throw AppError.badRequest('Trạng thái đề nghị không hợp lệ.');
      const companyId = offer.company_id ?? offer.companyId;
      const price = Number(offer.price_per_share_minor ?? offer.pricePerShareMinor);
      const totalInfo = await this.repository.getCompanyControlForCharacter(client, companyId, acquirerCharacterId);
      const allInfo = await this.repository.getCompanyControlForCharacter(client, companyId, '00000000-0000-0000-0000-000000000000');
      if (allInfo.totalShares <= 0) throw AppError.badRequest('Không có cổ phần.');
      const pct = (totalInfo.myShares / allInfo.totalShares) * 100;
      if (pct < 95) throw AppError.badRequest('Cần sở hữu tối thiểu 95% để ép mua cổ đông thiểu số.');
      if (totalInfo.myShares >= allInfo.totalShares) {
        await this.repository.setBuyoutOfferStatus(client, offerId, 'completed');
      } else {
        const others = await client.query<{ holder_character_id: string; shares: string }>(
          `SELECT holder_character_id, shares::text AS shares FROM company_shareholders WHERE company_id = $1 AND holder_character_id <> $2 AND shares > 0 FOR UPDATE`,
          [companyId, acquirerCharacterId],
        );
        let acquired = 0;
        for (const o of others.rows) {
          const s = Number(o.shares);
          if (s <= 0) continue;
          const cost = s * price;
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: acquirerCharacterId, kind: 'cash' },
            to: { ownerType: 'character', ownerId: o.holder_character_id, kind: 'cash' },
            amountMinor: cost,
            kind: 'company_buyout_squeeze_out',
            description: `Ép mua ${s} cổ phần`,
            referenceType: 'company_buyout_offer',
            referenceId: offerId,
          });
          await this.repository.transferShares(client, companyId, o.holder_character_id, acquirerCharacterId, s);
          await this.repository.recordBuyoutPurchase(client, {
            offerId,
            companyId,
            sellerCharacterId: o.holder_character_id,
            buyerCharacterId: acquirerCharacterId,
            shares: s,
            pricePerShareMinor: price,
            totalCostMinor: cost,
            isSqueezeOut: true,
          });
          acquired += s;
        }
        await this.repository.updateBuyoutOfferProgress(client, offerId, acquired, true);
        await this.repository.transferOwnership(client, companyId, acquirerCharacterId);
      }
      const rows = await this.repository.listBuyoutOffers(client, { companyId });
      const row = rows.find((r: any) => r.id === offerId) ?? rows[0];
      return this.mapBuyoutOffer(client, row, character.id);
    });
  }

  // === Merger A -> B ===
  async mergeCompanies(userId: string, survivorCompanyId: string, mergedCompanyId: string): Promise<any> {
    if (survivorCompanyId === mergedCompanyId) throw AppError.badRequest('Công ty sáp nhập và công ty tiếp nhận phải khác nhau.');
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const survivor = await this.repository.getCompany(survivorCompanyId, client);
      const merged = await this.repository.getCompany(mergedCompanyId, client);
      if (!survivor || !merged) throw AppError.notFound('Company');
      if (!['active', 'ipo'].includes(survivor.status) || !['active', 'ipo'].includes(merged.status)) {
        throw AppError.badRequest('Chỉ sáp nhập giữa các công ty đang hoạt động/IPO.');
      }
      if (survivor.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu công ty tiếp nhận mới được thực hiện sáp nhập.');
      }
      const mergedCtrl = await this.repository.getCompanyControlForCharacter(client, mergedCompanyId, character.id);
      if (mergedCtrl.totalShares <= 0 || mergedCtrl.myShares < mergedCtrl.totalShares) {
        throw AppError.badRequest('Cần sở hữu 100% công ty bị sáp nhập trước khi thực hiện sáp nhập.');
      }
      const survivorCtrl = await this.repository.getCompanyControlForCharacter(client, survivorCompanyId, character.id);
      if (survivorCtrl.totalShares <= 0 || survivorCtrl.myShares <= survivorCtrl.totalShares * 0.5) {
        throw AppError.badRequest('Bạn cần kiểm soát công ty tiếp nhận.');
      }

      // remove merged from group memberships if any
      const activeMembership = await client.query<{ group_id: string }>(
        `SELECT group_id FROM company_group_members WHERE company_id = $1 AND status = 'active'`,
        [mergedCompanyId],
      );
      for (const m of activeMembership.rows) {
        await this.repository.removeCompanyGroupMember(client, m.group_id, mergedCompanyId);
      }

      const mergedCash = await this.repository.getCompanyCashForUpdate(client, mergedCompanyId);
      let cashTransferred = 0;
      if (mergedCash > 0) {
        await ledger.transfer(client, {
          from: { ownerType: 'company', ownerId: mergedCompanyId, kind: 'cash' },
          to: { ownerType: 'company', ownerId: survivorCompanyId, kind: 'cash' },
          amountMinor: mergedCash,
          kind: 'company_merger_transfer',
          description: `Chuyển quỹ từ công ty sáp nhập ${merged.name}`,
          referenceType: 'company',
          referenceId: mergedCompanyId,
        });
        cashTransferred = mergedCash;
        await client.query(`UPDATE companies SET cash_minor = cash_minor + $2::bigint, valuation_minor = GREATEST(0, valuation_minor + $2::bigint), updated_at = now() WHERE id = $1`, [survivorCompanyId, mergedCash]);
        await client.query(`UPDATE companies SET cash_minor = 0, updated_at = now() WHERE id = $1`, [mergedCompanyId]);
      }

      // transfer premises claims to survivor (best-effort) and clear merged premises need
      await this.repository.transferPremisesClaimsToSurvivor(client, mergedCompanyId, survivorCompanyId).catch(() => {});
      await this.repository.releasePremisesClaim(client, mergedCompanyId).catch(() => {});
      // also clear merged company premises fields to avoid dangling
      await client.query(
        `UPDATE companies SET premises_needs_reselection = false, premises_invalid_reason = $2, premises_core_property_id = NULL, premises_province_land_property_id = NULL, premises_company_property_id = NULL, premises_type = NULL, premises_province_code = NULL, updated_at = now() WHERE id = $1`,
        [mergedCompanyId, `Đã sáp nhập vào công ty ${survivor.name}`],
      ).catch(() => {});

      const employmentsTransferred = await this.repository.moveEmploymentsToSurvivor(client, mergedCompanyId, survivorCompanyId);
      const staffTransferred = await this.repository.moveCompanyStaffToSurvivor(client, mergedCompanyId, survivorCompanyId);

      await this.repository.cleanupMergedCompanyMarketData(client, mergedCompanyId);
      await this.repository.markCompanyMerged(client, mergedCompanyId, survivorCompanyId);

      const mergerId = await this.repository.createMerger(client, {
        survivorCompanyId,
        mergedCompanyId,
        executedByCharacterId: character.id,
        cashTransferredMinor: cashTransferred,
        staffTransferred,
        employmentsTransferred,
        meta: { survivorName: survivor.name, mergedName: merged.name },
      });

      await notify(client, {
        userId,
        kind: 'company',
        title: 'Sáp nhập công ty',
        body: `Đã sáp nhập "${merged.name}" vào "${survivor.name}".`,
        payload: { mergerId, survivorCompanyId, mergedCompanyId, cashTransferred, staffTransferred, employmentsTransferred },
      }).catch(() => {});

      return {
        id: mergerId,
        survivorCompanyId,
        mergedCompanyId,
        cashTransferred: money(cashTransferred),
        staffTransferred,
        employmentsTransferred,
        executedAt: new Date().toISOString(),
      };
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

