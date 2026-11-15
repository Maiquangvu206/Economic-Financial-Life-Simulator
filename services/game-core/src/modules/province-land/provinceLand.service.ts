import crypto from 'node:crypto';
import { CONSTRUCTION_OPTIONS, type OwnedCluster } from '@efls/domain';
import { MoneySchema, type PropertyDto, type PropertySaleOfferDto } from '@efls/contracts';
import type { PoolClient } from 'pg';
import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { pool } from '../../shared/db/pool.js';
import { provinceLandRepository, type ProvinceLandPropertyRow, type ProvinceLandPurchaseOfferRow } from './provinceLand.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

async function notifyCharacter(db: PoolClient, characterId: string, input: { kind: string; title: string; body: string; payload?: Record<string, unknown> }) {
  const user = await db.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [characterId]);
  const userId = user.rows[0]?.user_id;
  if (!userId) return;
  await notify(db, { userId, kind: input.kind, title: input.title, body: input.body, payload: input.payload });
}

function offerDto(row: ProvinceLandPurchaseOfferRow, viewerCharacterId: string): PropertySaleOfferDto {
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

function toDto(row: ProvinceLandPropertyRow, viewerCharacterId: string, offers: PropertySaleOfferDto[] = []): PropertyDto {
  return {
    id: row.id,
    nodeId: row.id, // synthetic for province tiles
    name: row.constructionLabel ? `${row.constructionLabel} - ${row.nodeName}` : row.nodeName,
    lotNumber: `Lô ${row.nodeX}-${row.nodeY}`,
    province: row.provinceCode,
    location: { x: row.nodeX, y: row.nodeY },
    zoneType: row.zoneType as PropertyDto['zoneType'],
    propertyType: row.propertyType as PropertyDto['propertyType'],
    purchasePrice: money(Number(row.purchasePriceMinor)),
    currentValue: money(Number(row.currentValueMinor)),
    monthlyRent: money(Number(row.monthlyRentMinor)),
    rentListingActive: false,
    rentDeposit: money(0),
    rentNotes: null,
    askingPrice: null,
    saleNotes: null,
    status: row.status as PropertyDto['status'],
    ownerCharacterId: row.ownerCharacterId,
    ownerCompanyId: null,
    isMine: row.ownerCharacterId === viewerCharacterId,
    leasedByMe: false,
    activeLease: null,
    offers,
    constructionOption: row.constructionOption,
    constructionLabel: row.constructionLabel,
    constructionTier: row.constructionTier as PropertyDto['constructionTier'],
    constructionMultiplier: Number(row.constructionMultiplier ?? 1),
    constructionCostMinor: Number(row.constructionCostMinor ?? 0),
    constructionBuiltAt: row.constructionBuiltAt ? new Date(row.constructionBuiltAt).toISOString() : null,
    mergedIntoPropertyId: row.mergedIntoPropertyId,
    mergeGroupId: row.mergeGroupId,
  };
}

export class ProvinceLandService {
  constructor(private readonly repo = provinceLandRepository) {}

  async listByProvince(userId: string, provinceCode: string): Promise<PropertyDto[]> {
    const character = await requireCharacterByUserId(pool, userId);
    const rows = await this.repo.listByProvince(provinceCode);
    const ids = rows.map((r) => r.id);
    const offers = await this.repo.listOffersByPropertyIds(pool, ids);
    const offersByProp = new Map<string, PropertySaleOfferDto[]>();
    for (const o of offers) {
      if (o.buyerCharacterId !== character.id && o.sellerCharacterId !== character.id) continue;
      const list = offersByProp.get(o.propertyId) ?? [];
      list.push(offerDto(o, character.id));
      offersByProp.set(o.propertyId, list);
    }
    return rows.map((r) => toDto(r, character.id, offersByProp.get(r.id) ?? []));
  }

  private getConstructionOption(optionId: string) {
    for (const [tier, options] of Object.entries(CONSTRUCTION_OPTIONS) as Array<[OwnedCluster['tier'], Array<{ id: string; label: string; valueMultiplier: number; minTiles: number }> ]>) {
      const opt = options.find((o) => o.id === optionId);
      if (opt) return { ...opt, tier };
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

  async construct(
    userId: string,
    propertyId: string,
    optionId: string,
    memberPropertyIds: string[] = [],
    constructionName?: string,
  ): Promise<PropertyDto[]> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const option = this.getConstructionOption(optionId);
      if (!option) throw AppError.badRequest('Phương án xây dựng không hợp lệ.');
      const label = constructionName?.trim() || option.label;

      const uniqueIds = Array.from(new Set([propertyId, ...memberPropertyIds]));
      const rows = await this.repo.findByIds(client, uniqueIds);
      if (rows.length !== uniqueIds.length) throw AppError.notFound('Property');
      const byId = new Map(rows.map((r) => [r.id, r]));
      const primary = byId.get(propertyId);
      if (!primary) throw AppError.notFound('Property');
      const members = uniqueIds.filter((id) => id !== propertyId).map((id) => byId.get(id)!);
      const provinceCode = primary.provinceCode;

      if (rows.some((r) => r.provinceCode !== provinceCode)) {
        throw AppError.badRequest('Các lô hợp thửa phải cùng tỉnh/thành.');
      }
      if (primary.mergedIntoPropertyId || primary.constructionOption) {
        throw AppError.badRequest('Bất động sản này đã có công trình hoặc đã được hợp nhất.');
      }
      for (const p of rows) {
        if (p.ownerCharacterId !== character.id) throw AppError.forbidden('Bạn không sở hữu toàn bộ lô trong cụm hợp thửa.');
        if (p.status !== 'owned') throw AppError.badRequest('Chỉ có thể xây dựng trên lô đất đang sở hữu.');
        if (p.mergedIntoPropertyId || p.constructionOption) throw AppError.badRequest('Một hoặc nhiều lô đã có công trình/hợp nhất.');
      }

      const cells = rows.map((r) => ({ x: r.nodeX, y: r.nodeY }));
      if (!this.validateConnectedCluster(cells)) throw AppError.badRequest('Các lô hợp thửa phải liền kề nhau (4 hướng).');
      const size = rows.length;
      const tier = size >= 4 ? 'large' : size >= 2 ? 'small' : 'single';
      if (option.tier !== tier || option.minTiles > size) {
        throw AppError.badRequest('Phương án xây dựng không phù hợp với quy mô cụm (số ô).');
      }

      const totalBaseValue = rows.reduce((sum, r) => sum + Number(r.currentValueMinor), 0);
      const costMinor = Math.max(0, Math.round(totalBaseValue * 0.2));
      const cash = toMinor(character.cash_minor);
      if (cash < costMinor) throw AppError.conflict('insufficient_funds', `Số dư không đủ. Cần ${costMinor.toLocaleString('vi-VN')} ₫.`);

      if (costMinor > 0) {
        await ledger.transfer(client, {
          from: { ownerType: 'character', ownerId: character.id },
          to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
          amountMinor: costMinor,
          kind: 'property_construction',
          description: `Xây dựng ${label} (${size} ô) - ${provinceCode}`,
          referenceType: 'province_land_property',
          referenceId: primary.id,
        });
      }

      const newCurrentValueMinor = Math.round(totalBaseValue * option.valueMultiplier);
      const newMonthlyRentMinor = Math.max(0, Math.round(newCurrentValueMinor * 0.005));
      const mergeGroupId = size > 1 ? crypto.randomUUID() : null;

      await this.repo.applyConstruction(client, {
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

      return this.listByProvince(userId, provinceCode);
    });
  }

  async makeOffer(userId: string, provinceCode: string, propertyId: string, amountMinor: number, message?: string): Promise<PropertySaleOfferDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const rows = await this.repo.findByIds(client, [propertyId]);
      const property = rows[0];
      if (!property || property.provinceCode !== provinceCode) throw AppError.notFound('Property');
      if (!property.ownerCharacterId) throw AppError.badRequest('Lô đất chưa có chủ sở hữu.');
      if (property.ownerCharacterId === character.id) throw AppError.badRequest('Bạn không thể gửi đề nghị cho tài sản của mình.');
      if (property.status === 'auction') throw AppError.badRequest('Lô đất đang đấu giá, không thể gửi đề nghị mua trực tiếp.');
      if (!(property.constructionOption || property.constructionBuiltAt || property.mergedIntoPropertyId)) {
        throw AppError.badRequest('Chỉ có thể đề xuất mua thửa đất/công trình đã được xây dựng.');
      }
      if (amountMinor <= 0) throw AppError.badRequest('Số tiền đề nghị không hợp lệ.');

      const id = await this.repo.createOffer(client, {
        propertyId,
        provinceCode,
        buyerCharacterId: character.id,
        sellerCharacterId: property.ownerCharacterId,
        amountMinor,
        message: message?.trim() || null,
      });
      const offer = await this.repo.findOfferById(client, id);
      if (!offer) throw new Error('Không tạo được đề nghị');

      await notifyCharacter(client, property.ownerCharacterId, {
        kind: 'real_estate',
        title: 'Đề xuất mua đất/công trình',
        body: `Có đề xuất ${amountMinor.toLocaleString('vi-VN')} ₫ cho ${property.constructionLabel || property.nodeName} (${provinceCode}).`,
        payload: { propertyId, offerId: id, provinceCode, amountMinor },
      });

      return offerDto(offer, character.id);
    });
  }

  async respondOffer(userId: string, provinceCode: string, offerId: string, action: 'accept' | 'reject' | 'cancel'): Promise<PropertyDto[]> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const offer = await this.repo.findOfferById(client, offerId);
      if (!offer || offer.provinceCode !== provinceCode) throw AppError.notFound('Offer');
      if (offer.status !== 'pending') throw AppError.badRequest('Đề nghị này đã được xử lý.');

      const rows = await this.repo.findByIds(client, [offer.propertyId]);
      const property = rows[0];
      if (!property) throw AppError.notFound('Property');

      if (action === 'cancel') {
        if (offer.buyerCharacterId !== character.id) throw AppError.forbidden('Chỉ người mua mới có thể hủy đề nghị.');
        await this.repo.resolveOffer(client, offerId, 'cancelled');
        return this.listByProvince(userId, provinceCode);
      }

      if (offer.sellerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới có thể chấp nhận hoặc từ chối đề nghị.');
      }

      if (action === 'reject') {
        await this.repo.resolveOffer(client, offerId, 'rejected');
        return this.listByProvince(userId, provinceCode);
      }

      // accept
      const amount = Number(offer.amountMinor);
      const buyerRow = await client.query<{ cash_minor: string }>(
        `SELECT cash_minor FROM characters WHERE id = $1`,
        [offer.buyerCharacterId],
      );
      const buyer = buyerRow.rows[0];
      if (!buyer) throw AppError.notFound('Buyer');
      const buyerCash = toMinor(buyer.cash_minor);
      if (buyerCash < amount) {
        throw AppError.conflict('insufficient_funds', `Người mua không đủ số dư để hoàn tất giao dịch (${amount.toLocaleString('vi-VN')} ₫).`);
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: offer.buyerCharacterId },
        to: { ownerType: 'character', ownerId: offer.sellerCharacterId },
        amountMinor: amount,
        kind: 'property_sale',
        description: `Mua đất/công trình ${property.constructionLabel || property.nodeName} (${provinceCode})`,
        referenceType: 'province_land_property',
        referenceId: offer.propertyId,
      });

      const transferredIds = await this.repo.transferOwnership(client, offer.propertyId, offer.buyerCharacterId);
      await this.repo.resolveOffer(client, offerId, 'accepted');
      await this.repo.rejectPendingOffersForProperties(client, transferredIds.length ? transferredIds : [offer.propertyId], offerId);

      await notifyCharacter(client, offer.buyerCharacterId, {
        kind: 'real_estate',
        title: 'Đề xuất mua được chấp nhận',
        body: `Bạn đã mua ${property.constructionLabel || property.nodeName} (${provinceCode}) với giá ${amount.toLocaleString('vi-VN')} ₫.`,
        payload: { propertyId: offer.propertyId, offerId, provinceCode, amountMinor: amount },
      });

      return this.listByProvince(userId, provinceCode);
    });
  }
}

export const provinceLandService = new ProvinceLandService();
