import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { type CompanyDto, type CompanyOverviewDto, MoneySchema } from '@efls/contracts';
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
      const character = await requireCharacterByUserId(client, userId);
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
      const character = await requireCharacterByUserId(client, userId);
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
      const character = await requireCharacterByUserId(client, userId);
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
      const character = await requireCharacterByUserId(client, userId);
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
  async takeoverCompany(
    userId: string,
    companyId: string,
    buyerCharacterId: string,
  ): Promise<CompanyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
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
}

function formatMinor(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const corporationService = new CorporationService();
