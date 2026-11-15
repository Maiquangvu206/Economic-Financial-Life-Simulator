import crypto from 'node:crypto';
import { CONSTRUCTION_OPTIONS, type OwnedCluster } from '@efls/domain';
import { MoneySchema, type PropertyDto } from '@efls/contracts';
import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { pool } from '../../shared/db/pool.js';
import { provinceLandRepository, type ProvinceLandPropertyRow } from './provinceLand.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toDto(row: ProvinceLandPropertyRow, viewerCharacterId: string): PropertyDto {
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
    offers: [],
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
    return rows.map((r) => toDto(r, character.id));
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
}

export const provinceLandService = new ProvinceLandService();
