import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { type PropertyDto, type RealEstateOverviewDto, MoneySchema } from '@efls/contracts';
import { realEstateRepository } from './real-estate.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toPropertyDto(
  row: Awaited<ReturnType<typeof realEstateRepository.listProperties>>[number],
  viewerCharacterId: string,
  leasedByMe = false,
): PropertyDto {
  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.nodeName,
    location: { x: row.nodeX, y: row.nodeY },
    zoneType: row.nodeZoneType as PropertyDto['zoneType'],
    propertyType: row.propertyType as PropertyDto['propertyType'],
    purchasePrice: money(Number(row.purchasePriceMinor)),
    currentValue: money(Number(row.currentValueMinor)),
    monthlyRent: money(Number(row.monthlyRentMinor)),
    askingPrice: row.askingPriceMinor === null ? null : money(Number(row.askingPriceMinor)),
    status: row.status as PropertyDto['status'],
    ownerCharacterId: row.ownerCharacterId,
    ownerCompanyId: row.ownerCompanyId,
    isMine: row.ownerCharacterId === viewerCharacterId,
    leasedByMe,
  };
}

/** Dịch vụ bất động sản: xem danh sách, mua, đặt bán, cho thuê. */
export class RealEstateService {
  constructor(private readonly repository = realEstateRepository) {}

  async getOverview(userId: string): Promise<RealEstateOverviewDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [properties, leases] = await Promise.all([
      this.repository.listProperties(),
      this.repository.listActiveLeasesByCharacter(character.id),
    ]);
    const leasedPropertyIds = new Set(leases.map((l) => l.propertyId));

    const owned = properties.filter((p) => p.ownerCharacterId === character.id);
    const portfolioValue = owned.reduce((sum, p) => sum + toMinor(p.currentValueMinor), 0);
    const monthlyRentIncome = owned.reduce((sum, p) => sum + toMinor(p.monthlyRentMinor), 0);

    return {
      properties: properties.map((p) =>
        toPropertyDto(p, character.id, leasedPropertyIds.has(p.id)),
      ),
      ownedCount: owned.length,
      portfolioValue: money(portfolioValue),
      monthlyRentIncome: money(monthlyRentIncome),
    };
  }

  async buyProperty(userId: string, propertyId: string): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.status !== 'unowned' && property.status !== 'listed') {
        throw AppError.badRequest('Bất động sản này không được bán.');
      }

      const price =
        property.status === 'listed' && property.askingPriceMinor !== null
          ? Number(property.askingPriceMinor)
          : toMinor(property.purchasePriceMinor);
      const cash = toMinor(character.cash_minor);
      if (cash < price) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để mua bất động sản này.');
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: price,
        kind: 'property_purchase',
        description: `Mua bất động sản ${propertyId}`,
        referenceType: 'property',
        referenceId: propertyId,
      });

      await this.repository.buy(client, propertyId, character.id);
      const updated = await this.repository.findById(propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi mua');
      return toPropertyDto(updated, character.id);
    });
  }

  async listProperty(
    userId: string,
    propertyId: string,
    askingPriceMinor: number,
  ): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được đặt bán.');
      }
      if (property.status !== 'owned') {
        throw AppError.badRequest('Chỉ có thể đặt bán bất động sản đang sở hữu.');
      }

      await this.repository.list(client, propertyId, askingPriceMinor);
      const updated = await this.repository.findById(propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi đặt bán');
      return toPropertyDto(updated, character.id);
    });
  }

  async rentProperty(
    userId: string,
    propertyId: string,
    monthlyRentMinor: number,
  ): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId === character.id) {
        throw AppError.badRequest('Không thể cho thuê bất động sản của chính mình.');
      }
      if (await this.repository.hasActiveLease(client, propertyId)) {
        throw AppError.conflict('property_leased', 'Bất động sản này đang được cho thuê.');
      }

      await this.repository.rent(client, propertyId, character.id, monthlyRentMinor);
      const updated = await this.repository.findById(propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi cho thuê');
      return toPropertyDto(updated, character.id);
    });
  }
}

export const realEstateService = new RealEstateService();
