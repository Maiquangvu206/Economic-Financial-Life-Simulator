import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface ProvinceLandPropertyRow {
  id: string;
  provinceCode: string;
  nodeX: number;
  nodeY: number;
  zoneType: string;
  nodeName: string;
  ownerCharacterId: string | null;
  status: string;
  purchasePriceMinor: string;
  currentValueMinor: string;
  monthlyRentMinor: string;
  propertyType: string;
  constructionOption: string | null;
  constructionLabel: string | null;
  constructionTier: string | null;
  constructionMultiplier: string | number;
  constructionCostMinor: string | number;
  constructionBuiltAt: Date | null;
  mergedIntoPropertyId: string | null;
  mergeGroupId: string | null;
  askingPriceMinor: string | null;
  saleNotes: string | null;
  rentListingActive: boolean;
  rentDepositMinor: string;
  rentNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProvinceLandPurchaseOfferRow {
  id: string;
  propertyId: string;
  provinceCode: string;
  buyerCharacterId: string;
  buyerName: string | null;
  sellerCharacterId: string;
  amountMinor: string;
  status: string;
  message: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export class ProvinceLandRepository {
  constructor(readonly db: Db = pool) {}

  private readonly selectCols = `
              id,
              province_code AS "provinceCode",
              node_x AS "nodeX",
              node_y AS "nodeY",
              zone_type AS "zoneType",
              node_name AS "nodeName",
              owner_character_id AS "ownerCharacterId",
              status,
              purchase_price_minor AS "purchasePriceMinor",
              current_value_minor AS "currentValueMinor",
              monthly_rent_minor AS "monthlyRentMinor",
              property_type AS "propertyType",
              construction_option AS "constructionOption",
              construction_label AS "constructionLabel",
              construction_tier AS "constructionTier",
              construction_multiplier AS "constructionMultiplier",
              construction_cost_minor AS "constructionCostMinor",
              construction_built_at AS "constructionBuiltAt",
              merged_into_property_id AS "mergedIntoPropertyId",
              merge_group_id AS "mergeGroupId",
              asking_price_minor AS "askingPriceMinor",
              sale_notes AS "saleNotes",
              COALESCE(rent_listing_active, false) AS "rentListingActive",
              COALESCE(rent_deposit_minor, 0)::text AS "rentDepositMinor",
              rent_notes AS "rentNotes",
              created_at AS "createdAt",
              updated_at AS "updatedAt"`;

  async listByProvince(provinceCode: string): Promise<ProvinceLandPropertyRow[]> {
    const r = await this.db.query<ProvinceLandPropertyRow>(
      `SELECT ${this.selectCols}
       FROM province_land_properties
       WHERE province_code = $1
       ORDER BY updated_at DESC`,
      [provinceCode],
    );
    return r.rows;
  }

  async findByIds(db: Db, ids: string[]): Promise<ProvinceLandPropertyRow[]> {
    if (ids.length === 0) return [];
    const r = await db.query<ProvinceLandPropertyRow>(
      `SELECT ${this.selectCols}
       FROM province_land_properties
       WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return r.rows;
  }

  async applyConstruction(db: Db, input: {
    primaryId: string;
    memberIds: string[];
    mergeGroupId: string | null;
    optionId: string;
    label: string;
    tier: string;
    multiplier: number;
    costMinor: number;
    newPropertyType: string;
    newCurrentValueMinor: number;
    newMonthlyRentMinor: number;
  }): Promise<void> {
    await db.query(
      `UPDATE province_land_properties
       SET construction_option = $2,
           construction_label = $3,
           construction_tier = $4,
           construction_multiplier = $5,
           construction_cost_minor = $6,
           construction_built_at = now(),
           merge_group_id = $7,
           merged_into_property_id = NULL,
           property_type = $8,
           current_value_minor = $9,
           monthly_rent_minor = $10,
           status = 'owned',
           updated_at = now()
       WHERE id = $1`,
      [
        input.primaryId, input.optionId, input.label, input.tier, input.multiplier,
        input.costMinor, input.mergeGroupId, input.newPropertyType,
        input.newCurrentValueMinor, input.newMonthlyRentMinor,
      ],
    );
    if (input.memberIds.length > 0 && input.mergeGroupId) {
      await db.query(
        `UPDATE province_land_properties
         SET merge_group_id = $2,
             merged_into_property_id = $1,
             construction_option = $3,
             construction_label = $4,
             construction_tier = $5,
             construction_multiplier = 1,
             construction_cost_minor = 0,
             construction_built_at = now(),
             monthly_rent_minor = 0,
             status = 'owned',
             updated_at = now()
         WHERE id = ANY($6::uuid[])`,
        [input.primaryId, input.mergeGroupId, input.optionId, input.label, input.tier, input.memberIds],
      );
    }
  }

  async listOffersByPropertyIds(db: Db, propertyIds: string[]): Promise<ProvinceLandPurchaseOfferRow[]> {
    if (propertyIds.length === 0) return [];
    const r = await db.query<ProvinceLandPurchaseOfferRow>(
      `SELECT o.id, o.property_id AS "propertyId", o.province_code AS "provinceCode",
              o.buyer_character_id AS "buyerCharacterId", c.full_name AS "buyerName",
              o.seller_character_id AS "sellerCharacterId",
              o.amount_minor AS "amountMinor", o.status, o.message,
              o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.resolved_at AS "resolvedAt"
       FROM province_land_purchase_offers o
       LEFT JOIN characters c ON c.id = o.buyer_character_id
       WHERE o.property_id = ANY($1::uuid[]) AND o.status = 'pending'
       ORDER BY o.created_at DESC`,
      [propertyIds],
    );
    return r.rows;
  }

  async createOffer(db: Db, input: {
    propertyId: string;
    provinceCode: string;
    buyerCharacterId: string;
    sellerCharacterId: string;
    amountMinor: number;
    message: string | null;
  }): Promise<string> {
    const r = await db.query<{ id: string }>(
      `INSERT INTO province_land_purchase_offers (property_id, province_code, buyer_character_id, seller_character_id, amount_minor, status, message)
       VALUES ($1,$2,$3,$4,$5,'pending',$6) RETURNING id`,
      [input.propertyId, input.provinceCode, input.buyerCharacterId, input.sellerCharacterId, input.amountMinor, input.message],
    );
    return r.rows[0]!.id;
  }

  async findOfferById(db: Db, offerId: string): Promise<ProvinceLandPurchaseOfferRow | null> {
    const r = await db.query<ProvinceLandPurchaseOfferRow>(
      `SELECT o.id, o.property_id AS "propertyId", o.province_code AS "provinceCode",
              o.buyer_character_id AS "buyerCharacterId", c.full_name AS "buyerName",
              o.seller_character_id AS "sellerCharacterId",
              o.amount_minor AS "amountMinor", o.status, o.message,
              o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.resolved_at AS "resolvedAt"
       FROM province_land_purchase_offers o
       LEFT JOIN characters c ON c.id = o.buyer_character_id
       WHERE o.id = $1`,
      [offerId],
    );
    return r.rows[0] ?? null;
  }

  async resolveOffer(db: Db, offerId: string, status: 'accepted'|'rejected'|'cancelled'|'expired'): Promise<void> {
    await db.query(
      `UPDATE province_land_purchase_offers SET status = $2, resolved_at = now(), updated_at = now() WHERE id = $1`,
      [offerId, status],
    );
  }

  async rejectOtherPendingOffers(db: Db, propertyId: string, exceptOfferId: string): Promise<void> {
    await db.query(
      `UPDATE province_land_purchase_offers SET status = 'rejected', resolved_at = now(), updated_at = now()
       WHERE property_id = $1 AND id <> $2 AND status = 'pending'`,
      [propertyId, exceptOfferId],
    );
  }

  async getTransferGroupPropertyIds(db: Db, propertyId: string): Promise<string[]> {
    const info = await db.query<{ id: string; mergeGroupId: string | null; mergedIntoPropertyId: string | null }>(
      `SELECT id, merge_group_id AS "mergeGroupId", merged_into_property_id AS "mergedIntoPropertyId"
       FROM province_land_properties WHERE id = $1`,
      [propertyId],
    );
    const row = info.rows[0];
    if (!row) return [];
    let groupId: string | null = row.mergeGroupId;
    if (!groupId && row.mergedIntoPropertyId) {
      const parent = await db.query<{ mergeGroupId: string | null }>(
        `SELECT merge_group_id AS "mergeGroupId" FROM province_land_properties WHERE id = $1`,
        [row.mergedIntoPropertyId],
      );
      groupId = parent.rows[0]?.mergeGroupId ?? null;
    }
    if (!groupId) return [propertyId];
    const r = await db.query<{ id: string }>(
      `SELECT id FROM province_land_properties WHERE merge_group_id = $1`,
      [groupId],
    );
    return r.rows.map((x) => x.id);
  }

  async transferOwnership(db: Db, propertyId: string, buyerCharacterId: string): Promise<string[]> {
    const ids = await this.getTransferGroupPropertyIds(db, propertyId);
    if (ids.length === 0) return [];
    await db.query(
      `UPDATE province_land_properties
       SET owner_character_id = $2, status = 'owned', updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [ids, buyerCharacterId],
    );
    return ids;
  }

  async rejectPendingOffersForProperties(db: Db, propertyIds: string[], exceptOfferId: string): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE province_land_purchase_offers SET status = 'rejected', resolved_at = now(), updated_at = now()
       WHERE property_id = ANY($1::uuid[]) AND id <> $2 AND status = 'pending'`,
      [propertyIds, exceptOfferId],
    );
  }

  async cancelPendingOffersForProperties(db: Db, propertyIds: string[]): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE province_land_purchase_offers SET status = 'cancelled', resolved_at = now(), updated_at = now()
       WHERE property_id = ANY($1::uuid[]) AND status = 'pending'`,
      [propertyIds],
    );
  }

  async demolishToLand(db: Db, propertyIds: string[]): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE province_land_properties
       SET property_type = 'land',
           status = 'owned',
           construction_option = NULL,
           construction_label = NULL,
           construction_tier = NULL,
           construction_multiplier = 1,
           construction_cost_minor = 0,
           construction_built_at = NULL,
           merged_into_property_id = NULL,
           merge_group_id = NULL,
           monthly_rent_minor = 0,
           current_value_minor = purchase_price_minor,
           asking_price_minor = NULL,
           sale_notes = NULL,
           rent_listing_active = false,
           rent_deposit_minor = 0,
           rent_notes = NULL,
           updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [propertyIds],
    );
  }

  async listProperty(db: Db, propertyIds: string[], askingPriceMinor: number, saleNotes: string | null): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE province_land_properties
       SET status = 'listed', asking_price_minor = $2, sale_notes = $3, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [propertyIds, askingPriceMinor, saleNotes],
    );
  }

  async unlistProperty(db: Db, propertyIds: string[]): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE province_land_properties
       SET status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [propertyIds],
    );
  }

  async updateRentTerms(
    db: Db,
    propertyIds: string[],
    input: { monthlyRentMinor: number; rentDepositMinor: number; rentListingActive: boolean; rentNotes: string | null },
  ): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE province_land_properties
       SET monthly_rent_minor = $2,
           rent_deposit_minor = $3,
           rent_listing_active = $4,
           rent_notes = $5,
           updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [propertyIds, input.monthlyRentMinor, input.rentDepositMinor, input.rentListingActive, input.rentNotes],
    );
  }
}

export const provinceLandRepository = new ProvinceLandRepository();
