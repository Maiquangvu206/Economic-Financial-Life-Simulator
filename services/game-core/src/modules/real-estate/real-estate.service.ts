import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import {
  type PropertyDto,
  type PropertySaleOfferDto,
  type RealEstateOverviewDto,
  MoneySchema,
} from '@efls/contracts';
import { realEstateRepository, type PropertyRow, type PropertySaleOfferRow } from './real-estate.repository.js';
import { mapRepository } from '../map/map.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function offerDto(row: PropertySaleOfferRow, viewerCharacterId: string): PropertySaleOfferDto {
  return {
    id: row.id,
    propertyId: row.propertyId,
    buyerCharacterId: row.buyerCharacterId,
    buyerName: row.buyerName,
    sellerCharacterId: row.sellerCharacterId,
    amount: money(Number(row.amountMinor)),
    status: row.status as PropertySaleOfferDto['status'],
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    isMine: row.buyerCharacterId === viewerCharacterId || row.sellerCharacterId === viewerCharacterId,
  };
}

function toPropertyDto(
  row: PropertyRow,
  viewerCharacterId: string,
  leasedByMe = false,
  offers: PropertySaleOfferDto[] = [],
  activeLease: PropertyDto['activeLease'] = null,
): PropertyDto {
  const province = row.province ?? 'Thành phố Hà Nội';
  const lotNumber = row.lotNumber ?? `Lô ${row.nodeX}-${row.nodeY}`;
  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.nodeName,
    lotNumber,
    province,
    location: { x: row.nodeX, y: row.nodeY },
    zoneType: row.nodeZoneType as PropertyDto['zoneType'],
    propertyType: row.propertyType as PropertyDto['propertyType'],
    purchasePrice: money(Number(row.purchasePriceMinor)),
    currentValue: money(Number(row.currentValueMinor)),
    monthlyRent: money(Number(row.monthlyRentMinor)),
    rentListingActive: Boolean(row.rentListingActive),
    rentDeposit: money(Number(row.rentDepositMinor ?? 0)),
    rentNotes: row.rentNotes ?? null,
    askingPrice: row.askingPriceMinor === null ? null : money(Number(row.askingPriceMinor)),
    saleNotes: row.saleNotes ?? null,
    status: row.status as PropertyDto['status'],
    ownerCharacterId: row.ownerCharacterId,
    ownerCompanyId: row.ownerCompanyId,
    isMine: row.ownerCharacterId === viewerCharacterId,
    leasedByMe,
    activeLease: activeLease ?? null,
    offers,
  };
}

/** Dịch vụ bất động sản: xem danh sách, mua, bán/trao đổi, cho thuê, đấu giá liên quan. */
export class RealEstateService {
  constructor(private readonly repository = realEstateRepository) {}

  async getOverview(userId: string): Promise<RealEstateOverviewDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const [properties, myLeases, allActiveLeases] = await Promise.all([
      this.repository.listProperties(),
      this.repository.listActiveLeasesByCharacter(character.id),
      // lấy lease đang hoạt động cho các BĐS để hiển thị trạng thái (owner/người xem)
      (async () => {
        const rows = await db.query<{ id: string }>(`SELECT id FROM properties`);
        const ids = rows.rows.map((r) => r.id);
        return this.repository.listActiveLeasesByPropertyIds(ids);
      })(),
    ]);
    const leasedByMeIds = new Set(myLeases.map((l) => l.propertyId));
    const leaseByProp = new Map<string, (typeof allActiveLeases)[number]>();
    for (const l of allActiveLeases) leaseByProp.set(l.propertyId, l);

    const relevantIds = properties
      .filter(
        (p) =>
          p.ownerCharacterId === character.id ||
          p.status === 'listed' ||
          p.status === 'unowned' ||
          p.rentListingActive,
      )
      .map((p) => p.id);
    const offers = await this.repository.listOffersByPropertyIds(relevantIds);
    const offersByProp = new Map<string, PropertySaleOfferDto[]>();
    for (const o of offers) {
      if (o.buyerCharacterId !== character.id && o.sellerCharacterId !== character.id) continue;
      const list = offersByProp.get(o.propertyId) ?? [];
      list.push(offerDto(o, character.id));
      offersByProp.set(o.propertyId, list);
    }

    const owned = properties.filter((p) => p.ownerCharacterId === character.id);
    const portfolioValue = owned.reduce((sum, p) => sum + toMinor(p.currentValueMinor), 0);
    const monthlyRentIncome = owned.reduce((sum, p) => sum + toMinor(p.monthlyRentMinor), 0);

    return {
      properties: properties.map((p) => {
        const lease = leaseByProp.get(p.id);
        const activeLease = lease
          ? {
              tenantCharacterId: lease.tenantCharacterId,
              tenantName: lease.tenantName,
              monthlyRent: money(Number(lease.monthlyRentMinor)),
              startedAt: lease.startedAt.toISOString(),
              nextDueAt: lease.nextDueAt.toISOString(),
            }
          : null;
        return toPropertyDto(
          p,
          character.id,
          leasedByMeIds.has(p.id),
          offersByProp.get(p.id) ?? [],
          activeLease,
        );
      }),
      ownedCount: owned.length,
      portfolioValue: money(portfolioValue),
      monthlyRentIncome: money(monthlyRentIncome),
    };
  }

  private ensureFunds(cashMinor: number, priceMinor: number): void {
    if (cashMinor < priceMinor) {
      throw AppError.conflict(
        'insufficient_funds',
        `Số dư không đủ để thực hiện giao dịch. Cần ${priceMinor.toLocaleString('vi-VN')} ₫, hiện có ${cashMinor.toLocaleString('vi-VN')} ₫.`,
      );
    }
  }

  async buyProperty(userId: string, propertyId: string): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.status !== 'unowned' && property.status !== 'listed') {
        throw AppError.badRequest('Bất động sản này hiện không được bán.');
      }
      if (property.ownerCharacterId === character.id) {
        throw AppError.badRequest('Bạn đã sở hữu bất động sản này.');
      }

      const price =
        property.status === 'listed' && property.askingPriceMinor !== null
          ? Number(property.askingPriceMinor)
          : toMinor(property.purchasePriceMinor);
      const cash = toMinor(character.cash_minor);
      this.ensureFunds(cash, price);

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

  async buyLand(userId: string, x: number, y: number): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const node = await mapRepository.findNodeByCoord(client, x, y);
      if (!node) throw AppError.notFound('Ô đất');
      if (node.zoneType === 'water' || node.zoneType === 'park') {
        throw AppError.badRequest('Ô đất này thuộc vùng công cộng, không được mua.');
      }
      const price = Number(node.landPriceMinor);
      if (price <= 0) {
        throw AppError.badRequest('Ô đất này chưa được rao bán.');
      }
      const existing = await this.repository.findPropertyByNodeId(client, node.id);
      if (existing) {
        throw AppError.conflict(
          'property_exists',
          'Ô đất này đã có bất động sản. Hãy mua thông qua danh sách bất động sản.',
        );
      }

      const cash = toMinor(character.cash_minor);
      this.ensureFunds(cash, price);

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
        amountMinor: price,
        kind: 'property_purchase',
        description: `Mua đất nền ô [${x},${y}]`,
        referenceType: 'property',
        referenceId: node.id,
      });

      const propertyId = await this.repository.createLandProperty(client, {
        nodeId: node.id,
        ownerCharacterId: character.id,
        priceMinor: price,
        name: node.name,
        province: 'Thành phố Hà Nội',
        lotNumber: `Lô ${x}-${y}`,
      });
      const created = await this.repository.findById(propertyId, client);
      if (!created) throw new Error('Bất động sản biến mất trong khi mua đất');
      return toPropertyDto(created, character.id);
    });
  }

  async listProperty(
    userId: string,
    propertyId: string,
    askingPriceMinor: number,
    saleNotes?: string,
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

      await this.repository.list(client, propertyId, askingPriceMinor, saleNotes?.trim() || null);
      const updated = await this.repository.findById(propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi đặt bán');
      return toPropertyDto(updated, character.id);
    });
  }

  async updateRentTerms(
    userId: string,
    propertyId: string,
    input: {
      monthlyRentMinor: number;
      rentDepositMinor: number;
      rentListingActive: boolean;
      rentNotes?: string | null;
    },
  ): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được cập nhật bảng giá cho thuê.');
      }
      if (input.rentListingActive && input.monthlyRentMinor <= 0) {
        throw AppError.badRequest('Cần đặt giá thuê/tháng lớn hơn 0 để mở cho thuê.');
      }
      await this.repository.updateRentTerms(client, propertyId, {
        monthlyRentMinor: input.monthlyRentMinor,
        rentDepositMinor: input.rentDepositMinor,
        rentListingActive: input.rentListingActive,
        rentNotes: input.rentNotes?.trim() || null,
      });
      const updated = await this.repository.findById(propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất khi cập nhật cho thuê');
      return toPropertyDto(updated, character.id);
    });
  }

  async rentProperty(userId: string, propertyId: string): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId === character.id) {
        throw AppError.badRequest('Không thể thuê bất động sản của chính mình.');
      }
      if (!property.rentListingActive || Number(property.monthlyRentMinor) <= 0) {
        throw AppError.badRequest('Bất động sản này hiện không mở cho thuê hoặc chưa có bảng giá.');
      }
      if (await this.repository.hasActiveLease(client, propertyId)) {
        throw AppError.conflict('property_leased', 'Bất động sản này đang được cho thuê.');
      }

      const monthlyRent = Number(property.monthlyRentMinor);
      const deposit = Number(property.rentDepositMinor ?? 0);
      const upfront = monthlyRent + deposit;
      const cash = toMinor(character.cash_minor);
      if (upfront > 0) this.ensureFunds(cash, upfront);

      if (upfront > 0 && property.ownerCharacterId) {
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'character', ownerId: property.ownerCharacterId },
          amountMinor: upfront,
          kind: 'property_rent',
          description: `Thuê bất động sản ${propertyId}`,
          referenceType: 'property',
          referenceId: propertyId,
        });
      }

      await this.repository.rent(client, propertyId, character.id, monthlyRent);
      const updated = await this.repository.findById(propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi cho thuê');
      return toPropertyDto(updated, character.id, true);
    });
  }

  async makeOffer(
    userId: string,
    propertyId: string,
    amountMinor: number,
    message?: string,
  ): Promise<PropertySaleOfferDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId, client);
      if (!property) throw AppError.notFound('Property');
      if (!property.ownerCharacterId) throw AppError.badRequest('Bất động sản chưa có chủ sở hữu.');
      if (property.ownerCharacterId === character.id) {
        throw AppError.badRequest('Bạn không thể gửi đề nghị cho bất động sản của mình.');
      }
      if (property.status === 'auction') {
        throw AppError.badRequest('Bất động sản đang đấu giá, không thể gửi đề nghị mua trực tiếp.');
      }
      if (amountMinor <= 0) throw AppError.badRequest('Số tiền đề nghị không hợp lệ.');

      const id = await this.repository.createOffer(client, {
        propertyId,
        buyerCharacterId: character.id,
        sellerCharacterId: property.ownerCharacterId,
        amountMinor,
        message: message?.trim() || null,
      });
      const offer = await this.repository.findOfferById(client, id);
      if (!offer) throw new Error('Không tạo được đề nghị');

      // Thông báo cho người bán (nếu có user mapping)
      const sellerUser = await client.query<{ user_id: string }>(
        `SELECT user_id FROM characters WHERE id = $1`,
        [property.ownerCharacterId],
      );
      if (sellerUser.rows[0]?.user_id) {
        await notify(client as any, {
          userId: sellerUser.rows[0].user_id,
          kind: 'real_estate',
          title: 'Đề nghị mua bất động sản',
          body: `Có đề nghị ${amountMinor.toLocaleString('vi-VN')} ₫ cho ${property.nodeName}.`,
          payload: { propertyId, offerId: id, amountMinor },
        });
      }

      return offerDto(offer, character.id);
    });
  }

  async respondOffer(
    userId: string,
    offerId: string,
    action: 'accept' | 'reject' | 'cancel',
  ): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const offer = await this.repository.findOfferById(client, offerId);
      if (!offer) throw AppError.notFound('Offer');
      if (offer.status !== 'pending') throw AppError.badRequest('Đề nghị này đã được xử lý.');

      const property = await this.repository.findById(offer.propertyId, client);
      if (!property) throw AppError.notFound('Property');

      if (action === 'cancel') {
        if (offer.buyerCharacterId !== character.id) {
          throw AppError.forbidden('Chỉ người mua mới có thể hủy đề nghị.');
        }
        await this.repository.resolveOffer(client, offerId, 'cancelled');
        const updated = await this.repository.findById(offer.propertyId, client);
        if (!updated) throw new Error('Bất động sản biến mất');
        return toPropertyDto(updated, character.id);
      }

      if (offer.sellerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ người bán mới có thể chấp nhận hoặc từ chối đề nghị.');
      }

      if (action === 'reject') {
        await this.repository.resolveOffer(client, offerId, 'rejected');
        const updated = await this.repository.findById(offer.propertyId, client);
        if (!updated) throw new Error('Bất động sản biến mất');
        return toPropertyDto(updated, character.id);
      }

      // accept: chốt giá, chuyển tiền và quyền sở hữu
      const amount = Number(offer.amountMinor);
      const buyerRow = await client.query<{ cash_minor: string; user_id: string }>(
        `SELECT cash_minor, user_id FROM characters WHERE id = $1`,
        [offer.buyerCharacterId],
      );
      const buyer = buyerRow.rows[0];
      if (!buyer) throw AppError.notFound('Buyer');
      const buyerCash = toMinor(buyer.cash_minor);
      this.ensureFunds(buyerCash, amount);

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: offer.buyerCharacterId },
        to: { ownerType: 'character', ownerId: offer.sellerCharacterId },
        amountMinor: amount,
        kind: 'property_sale',
        description: `Chốt giá bán bất động sản ${offer.propertyId}`,
        referenceType: 'property',
        referenceId: offer.propertyId,
      });

      await this.repository.buy(client, offer.propertyId, offer.buyerCharacterId);
      await this.repository.resolveOffer(client, offerId, 'accepted');
      await this.repository.rejectOtherPendingOffers(client, offer.propertyId, offerId);

      await notify(client as any, {
        userId: buyer.user_id,
        kind: 'real_estate',
        title: 'Đề nghị được chấp nhận',
        body: `Bạn đã mua ${property.nodeName} với giá ${amount.toLocaleString('vi-VN')} ₫.`,
        payload: { propertyId: offer.propertyId, offerId, amountMinor: amount },
      });

      const updated = await this.repository.findById(offer.propertyId, client);
      if (!updated) throw new Error('Bất động sản biến mất sau khi chốt giá');
      return toPropertyDto(updated, character.id);
    });
  }
}

export const realEstateService = new RealEstateService();
