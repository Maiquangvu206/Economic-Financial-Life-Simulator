import { AppError } from '../../shared/http/errors.js';
import type { PoolClient } from 'pg';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId, resolveCharacterByCccd } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund } from '../../shared/state-fund/stateFund.js';
import { callAiService } from '../../shared/ai/aiClient.js';
import { notify } from '../notifications/notification.service.js';
import { loadCurrentSeasonEffects } from '../../shared/season/seasonEffects.js';
import { CONSTRUCTION_OPTIONS } from '@efls/domain';
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
    premises: premisesFromRow(row),
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

      const companyId = await this.repository.createCompany(client, {
        name,
        industry,
        ownerCharacterId: character.id,
        initialCapitalMinor,
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
      return { ...toCompanyDto(dto), isOwner: true, shareholders: [] };
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
       WHERE company_id = $1 AND status = 'active'`,
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

      await this.repository.addLedgerEntry(client, {
        companyId,
        entryType: input.entryType,
        amountMinor,
        declaredAmountMinor: declared,
        description: input.description ?? '',
        isEvasion,
        ledgerKind: 'MANUAL',
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

      const opexTotal = await this.repository.sumOpexInPeriod(client, companyId, periodKey);
      const taxDueMinor = Math.round(declaredRevenue * 0.1);
      const dividendPool = declaredRevenue - taxDueMinor - opexTotal;

      const companyCash = Number((await this.repository.getCompany(companyId, client))?.cashMinor ?? company.cashMinor ?? 0);
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
        `Kỳ ${periodKey}: DT thực tế ${formatMinor(actualRevenue)}, DT khai ${formatMinor(declaredRevenue)}, thuế ${formatMinor(taxDueMinor)}, OPEX kỳ ${formatMinor(opexTotal)}, quỹ cổ tức ${formatMinor(Math.max(0, dividendPool))}.`,
        dividendPool > 0 ? `Đã tự động chia cổ tức ${formatMinor(dividendDistributed)} cho ${dividendRecipients} cổ đông.` : 'Kỳ báo lỗ/không đủ quỹ chia cổ tức, không chia cổ tức.',
      ].filter(Boolean);

      await this.repository.createTaxFiling(client, {
        companyId,
        period: periodKey,
        periodKey,
        declaredRevenueMinor: declaredRevenue,
        actualRevenueMinor: actualRevenue,
        declaredExpenseMinor: opexTotal,
        actualExpenseMinor: opexTotal,
        taxDueMinor,
        taxPaidMinor: taxDueMinor,
        riskScore,
        status,
        notes: notesParts.join(' '),
        dividendPoolMinor: Math.max(0, dividendPool),
        dividendDistributedMinor: dividendDistributed,
        dividendDistributedAt: dividendPool > 0 ? new Date() : null,
        evasionGapMinor: evasionGap,
        opexTotalMinor: opexTotal,
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
}

function formatMinor(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const corporationService = new CorporationService();

