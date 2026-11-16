import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund } from '../../shared/state-fund/stateFund.js';
import { notify } from '../notifications/notification.service.js';
import { assertNoPendingDivorce } from '../social/social.freeze.js';
import {
  type PropertyDto,
  type PropertySaleOfferDto,
  type RealEstateOverviewDto,
  MoneySchema,
} from '@efls/contracts';
import { CONSTRUCTION_OPTIONS, type OwnedCluster } from '@efls/domain';
import { realEstateRepository, type PropertyRow, type PropertySaleOfferRow } from './real-estate.repository.js';
import { mapRepository } from '../map/map.repository.js';
import { corporationRepository } from '../corporations/corporation.repository.js';
import crypto from 'node:crypto';

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
  mergedMembers?: NonNullable<PropertyDto['mergedMembers']>,
): PropertyDto {
  const province = row.province ?? 'Thành phố Hà Nội';
  const lotNumber = row.lotNumber ?? `Lô ${row.nodeX}-${row.nodeY}`;
  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.constructionLabel ? `${row.constructionLabel} - ${row.nodeName}` : row.nodeName,
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
    constructionOption: row.constructionOption ?? null,
    constructionLabel: row.constructionLabel ?? null,
    constructionTier: (row.constructionTier as PropertyDto['constructionTier']) ?? null,
    constructionMultiplier: row.constructionMultiplier == null ? 1 : Number(row.constructionMultiplier),
    constructionCostMinor: row.constructionCostMinor == null ? 0 : Number(row.constructionCostMinor),
    constructionBuiltAt: row.constructionBuiltAt ? new Date(row.constructionBuiltAt).toISOString() : null,
    mergedIntoPropertyId: row.mergedIntoPropertyId ?? null,
    mergeGroupId: row.mergeGroupId ?? null,
    ...(mergedMembers && mergedMembers.length > 0 ? { mergedMembers } : {}),
  };
}

function toMergedMember(row: PropertyRow): NonNullable<PropertyDto['mergedMembers']>[number] {
  const province = row.province ?? 'Thành phố Hà Nội';
  const lotNumber = row.lotNumber ?? `Lô ${row.nodeX}-${row.nodeY}`;
  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.constructionLabel ? `${row.constructionLabel} - ${row.nodeName}` : row.nodeName,
    lotNumber,
    province,
    location: { x: row.nodeX, y: row.nodeY },
    zoneType: row.nodeZoneType as PropertyDto['zoneType'],
    propertyType: row.propertyType as PropertyDto['propertyType'],
    status: row.status as PropertyDto['status'],
    purchasePrice: money(Number(row.purchasePriceMinor)),
    currentValue: money(Number(row.currentValueMinor)),
    mergedIntoPropertyId: row.mergedIntoPropertyId ?? null,
    mergeGroupId: row.mergeGroupId ?? null,
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

    // Ẩn các ô thành viên của cụm hợp thửa/công trình khỏi danh sách (chỉ hiển thị ô chính).
    const membersByPrimary = new Map<string, PropertyRow[]>();
    for (const p of properties) {
      if (p.mergedIntoPropertyId) {
        const list = membersByPrimary.get(p.mergedIntoPropertyId) ?? [];
        list.push(p);
        membersByPrimary.set(p.mergedIntoPropertyId, list);
      }
    }
    const visibleProperties = properties.filter((p) => !p.mergedIntoPropertyId);

    const relevantIds = visibleProperties
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

    const ownedVisible = visibleProperties.filter((p) => p.ownerCharacterId === character.id);
    const portfolioValue = ownedVisible.reduce((sum, p) => sum + toMinor(p.currentValueMinor), 0);
    const monthlyRentIncome = ownedVisible.reduce((sum, p) => sum + toMinor(p.monthlyRentMinor), 0);

    return {
      properties: visibleProperties.map((p) => {
        const lease = leaseByProp.get(p.id);
        const activeLease = lease
          ? {
              id: lease.id,
              propertyId: lease.propertyId,
              tenantCharacterId: lease.tenantCharacterId,
              tenantName: lease.tenantName,
              monthlyRent: money(Number(lease.monthlyRentMinor)),
              deposit: money(Number((lease as any).depositMinor ?? 0)),
              startedAt: lease.startedAt.toISOString(),
              nextDueAt: lease.nextDueAt.toISOString(),
              endsAt: lease.endsAt ? lease.endsAt.toISOString() : null,
              termMonths: Number((lease as any).termMonths ?? 12),
              canTerminate: character.id === lease.tenantCharacterId || character.id === p.ownerCharacterId,
            }
          : null;
        const mergedMembers = (membersByPrimary.get(p.id) ?? []).map(toMergedMember);
        return toPropertyDto(
          p,
          character.id,
          leasedByMeIds.has(p.id),
          offersByProp.get(p.id) ?? [],
          activeLease,
          mergedMembers,
        );
      }),
      ownedCount: ownedVisible.length,
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

  private async resolveGroup(db: any, propertyId: string): Promise<{ ids: string[]; primaryId: string }> {
    const ids = await this.repository.findGroupPropertyIds(db, propertyId);
    const effectiveIds = ids.length > 0 ? ids : [propertyId];
    const rows = await this.repository.findByIds(db, effectiveIds);
    const primary = rows.find((r) => !r.mergedIntoPropertyId) ?? rows[0];
    return { ids: effectiveIds, primaryId: primary?.id ?? propertyId };
  }

  private async applyToGroup(db: any, ids: string[], sql: string, params: any[]): Promise<void> {
    // helper: replace first $N placeholder usage pattern by caller is not trivial; use per-id updates
    // (kept for potential reuse) - callers use explicit queries below.
    void db; void ids; void sql; void params;
  }

  async buyProperty(userId: string, propertyId: string): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const { ids: groupIds, primaryId } = await this.resolveGroup(client, propertyId);
      const property = await this.repository.findById(primaryId, client);
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
        description: `Mua bất động sản ${primaryId}`,
        referenceType: 'property',
        referenceId: primaryId,
      });

      // Chuyển quyền sở hữu toàn bộ cụm (áp dụng cho cả ô chính và ô thành viên).
      await this.repository.transferOwnership(client, primaryId, character.id);
      const updated = await this.repository.findById(primaryId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi mua');
      return toPropertyDto(updated, character.id);
    });
  }

  async buyLand(userId: string, x: number, y: number): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
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
      const character = await requireLivingCharacterByUserId(client, userId);
      const { ids: groupIds, primaryId } = await this.resolveGroup(client, propertyId);
      const property = await this.repository.findById(primaryId, client);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được đặt bán.');
      }
      await assertNoPendingDivorce(character.id, client);
      if (property.status !== 'owned') {
        throw AppError.badRequest('Chỉ có thể đặt bán bất động sản đang sở hữu.');
      }
      // Áp dụng cho toàn bộ cụm (ô chính + ô thành viên).
      for (const id of groupIds) {
        await this.repository.list(client, id, askingPriceMinor, saleNotes?.trim() || null);
      }
      const updated = await this.repository.findById(primaryId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi đặt bán');
      return toPropertyDto(updated, character.id);
    });
  }

  async unlistProperty(userId: string, propertyId: string): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const { ids: groupIds, primaryId } = await this.resolveGroup(client, propertyId);
      const property = await this.repository.findById(primaryId, client);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được ngưng bán.');
      }
      if (property.status !== 'listed') {
        throw AppError.badRequest('Bất động sản này hiện không ở trạng thái đang bán.');
      }
      for (const id of groupIds) {
        await this.repository.unlist(client, id);
      }
      const updated = await this.repository.findById(primaryId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi ngưng bán');
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
      const character = await requireLivingCharacterByUserId(client, userId);
      const { ids: groupIds, primaryId } = await this.resolveGroup(client, propertyId);
      const property = await this.repository.findById(primaryId, client);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được cập nhật bảng giá cho thuê.');
      }
      if (input.rentListingActive && input.monthlyRentMinor <= 0) {
        throw AppError.badRequest('Cần đặt giá thuê/tháng lớn hơn 0 để mở cho thuê.');
      }
      // Áp dụng bảng giá/cho thuê cho toàn bộ cụm.
      for (const id of groupIds) {
        await this.repository.updateRentTerms(client, id, {
          monthlyRentMinor: input.monthlyRentMinor,
          rentDepositMinor: input.rentDepositMinor,
          rentListingActive: input.rentListingActive,
          rentNotes: input.rentNotes?.trim() || null,
        });
      }
      const updated = await this.repository.findById(primaryId, client);
      if (!updated) throw new Error('Bất động sản biến mất khi cập nhật cho thuê');
      return toPropertyDto(updated, character.id);
    });
  }

  async rentProperty(userId: string, propertyId: string): Promise<PropertyDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const { ids: groupIds, primaryId } = await this.resolveGroup(client, propertyId);
      const property = await this.repository.findById(primaryId, client);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId === character.id) {
        throw AppError.badRequest('Không thể thuê bất động sản của chính mình.');
      }
      if (!property.rentListingActive || Number(property.monthlyRentMinor) <= 0) {
        throw AppError.badRequest('Bất động sản này hiện không mở cho thuê hoặc chưa có bảng giá.');
      }
      if (await this.repository.hasActiveLease(client, primaryId)) {
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
          description: `Thuê bất động sản ${primaryId}`,
          referenceType: 'property',
          referenceId: primaryId,
        });
      }

      // Hợp đồng thuê gắn với ô chính; áp dụng cho toàn bộ cụm.
      await this.repository.rent(client, primaryId, character.id, monthlyRent, deposit, 12);
      // Đảm bảo các ô thành viên không bị mở cho thuê rời rạc (dữ liệu nhất quán).
      for (const id of groupIds) {
        if (id === primaryId) continue;
        await this.repository.updateRentTerms(client, id, {
          monthlyRentMinor: 0,
          rentDepositMinor: 0,
          rentListingActive: false,
          rentNotes: null,
        });
      }
      const updated = await this.repository.findById(primaryId, client);
      if (!updated) throw new Error('Bất động sản biến mất trong khi cho thuê');
      const active = await this.repository.findActiveLeaseByPropertyId(client, primaryId);
      const activeLease = active
        ? {
            id: active.id,
            propertyId: active.propertyId,
            tenantCharacterId: active.tenantCharacterId,
            tenantName: active.tenantName,
            monthlyRent: money(Number(active.monthlyRentMinor)),
            deposit: money(Number(active.depositMinor ?? 0)),
            startedAt: active.startedAt.toISOString(),
            nextDueAt: active.nextDueAt.toISOString(),
            endsAt: active.endsAt ? active.endsAt.toISOString() : null,
            termMonths: Number(active.termMonths ?? 12),
            canTerminate: true,
          }
        : null;
      return toPropertyDto(updated, character.id, true, [], activeLease);
    });
  }

  async makeOffer(
    userId: string,
    propertyId: string,
    amountMinor: number,
    message?: string,
  ): Promise<PropertySaleOfferDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
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
      const character = await requireLivingCharacterByUserId(client, userId);
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

      // accept: chốt giá, chuyển tiền và quyền sở hữu (phong tỏa khi có ly hôn pending)
      await assertNoPendingDivorce(offer.sellerCharacterId, client);
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

      await this.repository.transferOwnership(client, offer.propertyId, offer.buyerCharacterId);
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

  private getConstructionOption(optionId: string, tier?: OwnedCluster['tier']) {
    const entries = Object.entries(CONSTRUCTION_OPTIONS) as Array<[OwnedCluster['tier'], Array<{ id: string; label: string; valueMultiplier: number; minTiles: number }>]>;
    if (tier) {
      const opt = (CONSTRUCTION_OPTIONS[tier] ?? []).find((o) => o.id === optionId);
      return opt ? { ...opt, tier } : null;
    }
    for (const [t, options] of entries) {
      const opt = options.find((o) => o.id === optionId);
      if (opt) return { ...opt, tier: t };
    }
    return null;
  }

  private constructionPropertyType(optionId: string): string {
    switch (optionId) {
      case 'shop': return 'shop';
      case 'garage': return 'garage';
      case 'mini-apartment': return 'mini_apartment';
      case 'boutique-hotel': return 'boutique_hotel';
      case 'shopping-center': return 'shopping_center';
      case 'office-tower': return 'office_tower';
      case 'company_hq': return 'office';
      case 'house4': return 'house';
      default: return 'house';
    }
  }

  private isAdjacent(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
    return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) === 1;
  }

  private validateConnectedCluster(cells: Array<{ x: number; y: number }>): boolean {
    if (cells.length <= 1) return true;
    const remaining = new Set(cells.map((c) => `${c.x}-${c.y}`));
    const queue = [cells[0]!];
    remaining.delete(`${cells[0]!.x}-${cells[0]!.y}`);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of cells) {
        const key = `${n.x}-${n.y}`;
        if (!remaining.has(key)) continue;
        if (this.isAdjacent(cur, n)) {
          remaining.delete(key);
          queue.push(n);
        }
      }
    }
    return remaining.size === 0;
  }

  async constructProperty(
    userId: string,
    propertyId: string,
    optionId: string,
    memberPropertyIds: string[] = [],
    constructionName?: string,
  ): Promise<RealEstateOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);

      const uniqueIds = Array.from(new Set([propertyId, ...memberPropertyIds]));
      const rows = await this.repository.findByIds(client, uniqueIds);
      if (rows.length !== uniqueIds.length) throw AppError.notFound('Property');
      const byId = new Map(rows.map((r) => [r.id, r]));
      const primary = byId.get(propertyId);
      if (!primary) throw AppError.notFound('Property');
      const members = uniqueIds.filter((id) => id !== propertyId).map((id) => byId.get(id)!);

      if (primary.mergedIntoPropertyId) {
        throw AppError.badRequest('Bất động sản này đã được hợp nhất vào công trình khác.');
      }
      if (primary.constructionOption) {
        throw AppError.badRequest('Bất động sản này đã có công trình. Không thể xây lại.');
      }

      for (const p of rows) {
        if (p.ownerCharacterId !== character.id) throw AppError.forbidden('Bạn không sở hữu toàn bộ lô trong cụm hợp thửa.');
        if (p.status !== 'owned') throw AppError.badRequest('Chỉ có thể xây dựng trên bất động sản đang sở hữu (không rao bán/đấu giá).');
        if (p.rentListingActive || (await this.repository.hasActiveLease(client, p.id))) {
          throw AppError.badRequest('Không thể xây dựng/hợp thửa khi bất động sản đang cho thuê hoặc có hợp đồng thuê hoạt động.');
        }
        if (p.mergedIntoPropertyId) throw AppError.badRequest('Một hoặc nhiều lô đã được hợp nhất trước đó.');
        if (p.constructionOption) throw AppError.badRequest('Một hoặc nhiều lô đã có công trình.');
      }

      const clusterCells = rows.map((r) => ({ x: r.nodeX, y: r.nodeY }));
      if (!this.validateConnectedCluster(clusterCells)) {
        throw AppError.badRequest('Các lô hợp thửa phải liền kề nhau (4 hướng).');
      }
      const size = rows.length;
      const tier = size >= 4 ? 'large' : size >= 2 ? 'small' : 'single';
      const option = this.getConstructionOption(optionId, tier);
      if (!option) throw AppError.badRequest('Phương án xây dựng không hợp lệ.');
      if (option.minTiles > size) {
        throw AppError.badRequest(`Phương án này cần tối thiểu ${option.minTiles} ô liền kề.`);
      }
      const label = constructionName?.trim() || option.label;

      const totalBaseValue = rows.reduce((sum, r) => sum + Number(r.currentValueMinor), 0);
      const costMinor = Math.max(0, Math.round(totalBaseValue * 0.2)); // 20% tổng giá trị hiện tại
      const cash = toMinor(character.cash_minor);
      this.ensureFunds(cash, costMinor);

      if (costMinor > 0) {
        await creditStateFund(
          client,
          { ownerType: 'character', ownerId: character.id, kind: 'cash' },
          costMinor,
          {
            amountMinor: costMinor,
            reasonCode: 'property_construction_fee',
            description: `Phí/thuế xây dựng ${label} (${size} ô) vào quỹ đất nước`,
            refType: 'property',
            refId: primary.id,
            actorType: 'character',
            actorId: character.id,
            ledgerKind: 'property_construction',
            ledgerDescription: `Xây dựng ${label} (${size} ô)`,
          },
        );
      }

      const newCurrentValueMinor = Math.round(totalBaseValue * option.valueMultiplier);
      // Thu nhập cho thuê ước tính/tháng ~0.5% giá trị sau xây dựng (đơn giản, rõ ràng)
      const newMonthlyRentMinor = Math.max(0, Math.round(newCurrentValueMinor * 0.005));
      const mergeGroupId = size > 1 ? crypto.randomUUID() : null;

      await this.repository.applyConstruction(client, {
        primaryId: primary.id,
        memberIds: members.map((m) => m.id),
        mergeGroupId,
        optionId: option.id,
        label,
        tier,
        multiplier: option.valueMultiplier,
        costMinor,
        newPropertyType: this.constructionPropertyType(option.id),
        newCurrentValueMinor,
        newMonthlyRentMinor,
      });

      const result = await this.getOverview(userId);
      return result;
    });
  }

  async demolishProperty(userId: string, propertyId: string): Promise<RealEstateOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const target = await this.repository.findById(propertyId, client);
      if (!target) throw AppError.notFound('Property');

      const groupIds = await this.repository.findGroupPropertyIds(client, propertyId);
      const rows = await this.repository.findByIds(client, groupIds.length > 0 ? groupIds : [propertyId]);
      if (rows.length === 0) throw AppError.notFound('Property');

      const hasConstruction = rows.some((r) => !!r.constructionOption || !!r.mergedIntoPropertyId || !!r.mergeGroupId);
      if (!hasConstruction) {
        throw AppError.badRequest('Chỉ có thể phá dỡ công trình hoặc hủy hợp thửa để trả về đất nền.');
      }

      for (const p of rows) {
        if (p.ownerCharacterId !== character.id) {
          throw AppError.forbidden('Chỉ chủ sở hữu mới có thể phá dỡ công trình/hủy hợp thửa.');
        }
        if (p.status !== 'owned') {
          throw AppError.badRequest('Không thể phá dỡ khi tài sản đang rao bán/đấu giá. Vui lòng ngưng bán hoặc xử lý trạng thái trước.');
        }
        if (p.rentListingActive || (await this.repository.hasActiveLease(client, p.id))) {
          throw AppError.badRequest('Không thể phá dỡ khi tài sản đang cho thuê hoặc có hợp đồng thuê hoạt động.');
        }
      }

      await this.repository.cancelPendingOffersForProperties(client, rows.map((r) => r.id));
      const affectedPropertyIds = rows.map((r) => r.id);
      await this.repository.demolishToLand(client, affectedPropertyIds);

      // Nếu công trình/địa điểm bị phá dỡ là trụ sở công ty -> yêu cầu chọn trụ sở mới và thông báo
      const affectedCompanies = await corporationRepository.invalidateCompaniesForDemolishedCoreProperties(
        client,
        affectedPropertyIds,
        'Công trình/địa điểm trụ sở đã bị phá dỡ hoặc hủy hợp thửa. Vui lòng chọn trụ sở mới cho công ty.',
      );
      for (const c of affectedCompanies) {
        if (!c.ownerUserId) continue;
        await notify(client, {
          userId: c.ownerUserId,
          kind: 'company',
          title: 'Cần chọn trụ sở mới cho công ty',
          body: `Công trình/địa điểm trụ sở của công ty "${c.companyName}" đã bị phá dỡ hoặc hủy hợp thửa. Vui lòng chọn trụ sở mới để tiếp tục quản lý/đại diện công ty.`,
          payload: { companyId: c.companyId, reason: 'premises_demolished' },
        });
      }

      return this.getOverview(userId);
    });
  }

  async terminateLease(userId: string, propertyId: string): Promise<RealEstateOverviewDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const property = await this.repository.findById(propertyId, client);
      if (!property) throw AppError.notFound('Property');
      const lease = await this.repository.findActiveLeaseByPropertyId(client, propertyId);
      if (!lease) throw AppError.badRequest('Bất động sản này hiện không có hợp đồng thuê đang hoạt động.');

      const ownerId = property.ownerCharacterId;
      if (!ownerId) throw AppError.badRequest('Bất động sản chưa có chủ sở hữu hợp lệ.');
      const isTenant = lease.tenantCharacterId === character.id;
      const isOwner = ownerId === character.id;
      if (!isTenant && !isOwner) {
        throw AppError.forbidden('Chỉ chủ sở hữu hoặc người thuê mới có thể hủy hợp đồng thuê.');
      }

      const now = Date.now();
      const endsAtMs = lease.endsAt ? new Date(lease.endsAt).getTime() : (new Date(lease.startedAt).getTime() + Number(lease.termMonths ?? 12) * 30 * 24 * 60 * 60 * 1000);
      const remainingMs = Math.max(0, endsAtMs - now);
      const remainingMonths = Math.ceil(remainingMs / (30 * 24 * 60 * 60 * 1000));
      const monthlyRent = Number(lease.monthlyRentMinor);
      const depositMinor = Number(lease.depositMinor ?? 0);
      const remainingDue = Math.max(0, monthlyRent * remainingMonths);
      const penalty = Math.round(remainingDue * 0.5);

      const cancellerId = character.id;
      const otherId = isTenant ? ownerId : lease.tenantCharacterId;

      const cancellerRow = await client.query<{ cash_minor: string }>(`SELECT cash_minor FROM characters WHERE id = $1`, [cancellerId]);
      const cancellerCash = toMinor(cancellerRow.rows[0]?.cash_minor ?? 0);

      if (isTenant) {
        // Người thuê hủy: mất cọc (chủ sở hữu giữ, đã nhận trước) + trả 50% tiền thuê còn lại đến hết hạn.
        this.ensureFunds(cancellerCash, penalty);
        if (penalty > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: cancellerId },
            to: { ownerType: 'character', ownerId: ownerId },
            amountMinor: penalty,
            kind: 'lease_termination_penalty',
            description: `Phạt hủy hợp đồng thuê trước hạn (người thuê) BĐS ${propertyId}`,
            referenceType: 'lease',
            referenceId: lease.id,
          });
        }
      } else {
        // Chủ sở hữu hủy: mất cọc (hoàn cọc cho người thuê) + trả 50% tiền thuê còn lại đến hết hạn.
        const ownerPayment = depositMinor + penalty;
        this.ensureFunds(cancellerCash, ownerPayment);
        if (ownerPayment > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'character', ownerId: ownerId },
            to: { ownerType: 'character', ownerId: lease.tenantCharacterId },
            amountMinor: ownerPayment,
            kind: 'lease_termination_compensation',
            description: `Bồi thường hủy hợp đồng thuê trước hạn (chủ sở hữu) BĐS ${propertyId}`,
            referenceType: 'lease',
            referenceId: lease.id,
          });
        }
      }

      const note = isTenant
        ? `Người thuê hủy trước hạn: mất cọc ${depositMinor.toLocaleString('vi-VN')} ₫ (chủ giữ), phạt 50% tiền thuê còn lại ${penalty.toLocaleString('vi-VN')} ₫ (còn ${remainingMonths} tháng).`
        : `Chủ sở hữu hủy trước hạn: hoàn cọc ${depositMinor.toLocaleString('vi-VN')} ₫ + bồi thường 50% tiền thuê còn lại ${penalty.toLocaleString('vi-VN')} ₫ (còn ${remainingMonths} tháng).`;
      await this.repository.terminateLease(client, lease.id, cancellerId, penalty, note);

      const otherUser = await client.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [otherId]);
      if (otherUser.rows[0]?.user_id) {
        await notify(client as any, {
          userId: otherUser.rows[0].user_id,
          kind: 'real_estate',
          title: 'Hợp đồng thuê đã bị hủy trước hạn',
          body: note,
          payload: { propertyId, leaseId: lease.id, terminatedBy: cancellerId },
        });
      }

      return this.getOverview(userId);
    });
  }
}

export const realEstateService = new RealEstateService();


