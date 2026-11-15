import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface PropertyRow {
  id: string;
  nodeId: string;
  nodeName: string;
  nodeX: number;
  nodeY: number;
  nodeZoneType: string;
  ownerCharacterId: string | null;
  ownerCompanyId: string | null;
  propertyType: string;
  purchasePriceMinor: string;
  currentValueMinor: string;
  monthlyRentMinor: string;
  askingPriceMinor: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lotNumber: string | null;
  province: string | null;
  rentListingActive: boolean;
  rentDepositMinor: string;
  rentNotes: string | null;
  saleNotes: string | null;
  constructionOption: string | null;
  constructionLabel: string | null;
  constructionTier: string | null;
  constructionMultiplier: string | number | null;
  constructionCostMinor: string | number | null;
  constructionBuiltAt: Date | null;
  mergedIntoPropertyId: string | null;
  mergeGroupId: string | null;
}

export interface LeaseRow {
  id: string;
  propertyId: string;
  tenantCharacterId: string;
  tenantName: string | null;
  monthlyRentMinor: string;
  status: string;
  startedAt: Date;
  endsAt: Date | null;
  nextDueAt: Date;
}

export interface PropertySaleOfferRow {
  id: string;
  propertyId: string;
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

const PROPERTY_SELECT = `
  SELECT p.id, p.node_id AS "nodeId", m.name AS "nodeName", m.x AS "nodeX", m.y AS "nodeY",
         m.zone_type AS "nodeZoneType",
         p.owner_character_id AS "ownerCharacterId", p.owner_company_id AS "ownerCompanyId",
         p.property_type AS "propertyType", p.purchase_price_minor AS "purchasePriceMinor",
         p.current_value_minor AS "currentValueMinor",
         p.monthly_rent_minor AS "monthlyRentMinor",
         p.asking_price_minor AS "askingPriceMinor",
         p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt",
         p.lot_number AS "lotNumber", p.province,
         p.rent_listing_active AS "rentListingActive",
         p.rent_deposit_minor AS "rentDepositMinor",
         p.rent_notes AS "rentNotes",
         p.sale_notes AS "saleNotes",
         p.construction_option AS "constructionOption",
         p.construction_label AS "constructionLabel",
         p.construction_tier AS "constructionTier",
         p.construction_multiplier AS "constructionMultiplier",
         p.construction_cost_minor AS "constructionCostMinor",
         p.construction_built_at AS "constructionBuiltAt",
         p.merged_into_property_id AS "mergedIntoPropertyId",
         p.merge_group_id AS "mergeGroupId"
  FROM properties p
  JOIN map_nodes m ON p.node_id = m.id
`;

/** Truy cập bảng properties và leases (bất động sản), join map_nodes để lấy vị trí/vùng. */
export class RealEstateRepository {
  constructor(readonly db: Db = pool) {}

  async listProperties(): Promise<PropertyRow[]> {
    const result = await this.db.query<PropertyRow>(
      `${PROPERTY_SELECT} ORDER BY p.created_at DESC`,
    );
    return result.rows;
  }

  async findById(id: string, db: Db = this.db): Promise<PropertyRow | null> {
    const result = await db.query<PropertyRow>(`${PROPERTY_SELECT} WHERE p.id = $1`, [id]);
    return result.rows[0] ?? null;
  }

  async listActiveLeasesByCharacter(characterId: string): Promise<LeaseRow[]> {
    const result = await this.db.query<LeaseRow>(
      `SELECT l.id, l.property_id AS "propertyId", l.tenant_character_id AS "tenantCharacterId",
              c.full_name AS "tenantName",
              l.monthly_rent_minor AS "monthlyRentMinor", l.status, l.started_at AS "startedAt",
              l.ends_at AS "endsAt", l.next_due_at AS "nextDueAt"
       FROM leases l
       LEFT JOIN characters c ON c.id = l.tenant_character_id
       WHERE l.tenant_character_id = $1 AND l.status = 'active'`,
      [characterId],
    );
    return result.rows;
  }

  async listActiveLeasesByPropertyIds(propertyIds: string[]): Promise<LeaseRow[]> {
    if (propertyIds.length === 0) return [];
    const result = await this.db.query<LeaseRow>(
      `SELECT l.id, l.property_id AS "propertyId", l.tenant_character_id AS "tenantCharacterId",
              c.full_name AS "tenantName",
              l.monthly_rent_minor AS "monthlyRentMinor", l.status, l.started_at AS "startedAt",
              l.ends_at AS "endsAt", l.next_due_at AS "nextDueAt"
       FROM leases l
       LEFT JOIN characters c ON c.id = l.tenant_character_id
       WHERE l.property_id = ANY($1::uuid[]) AND l.status = 'active'`,
      [propertyIds],
    );
    return result.rows;
  }

  async hasActiveLease(client: Db, propertyId: string): Promise<boolean> {
    const result = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM leases WHERE property_id = $1 AND status = 'active'`,
      [propertyId],
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async findPropertyByNodeId(db: Db, nodeId: string): Promise<PropertyRow | null> {
    const result = await db.query<PropertyRow>(`${PROPERTY_SELECT} WHERE p.node_id = $1`, [nodeId]);
    return result.rows[0] ?? null;
  }

  async createLandProperty(
    client: Db,
    input: {
      nodeId: string;
      ownerCharacterId: string;
      priceMinor: number;
      name: string;
      province: string | null;
      lotNumber: string | null;
    },
  ): Promise<string> {
    const result = await client.query<{ id: string }>(
      `INSERT INTO properties (id, node_id, owner_character_id, property_type,
              purchase_price_minor, current_value_minor, monthly_rent_minor, status, province, lot_number)
       VALUES (gen_random_uuid(), $1, $2, 'land', $3, $3, 0, 'owned', $4, $5)
       RETURNING id`,
      [input.nodeId, input.ownerCharacterId, input.priceMinor, input.province, input.lotNumber],
    );
    return result.rows[0]!.id;
  }

  async buy(client: Db, propertyId: string, buyerCharacterId: string): Promise<void> {
    await client.query(
      `UPDATE properties
       SET owner_character_id = $2, owner_company_id = NULL,
           status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('unowned', 'listed')`,
      [propertyId, buyerCharacterId],
    );
  }

  /** Chuyển quyền sở hữu khi chốt giao dịch (mua/đề nghị được chấp nhận), kể cả BĐS đang owned.
   *  Nếu BĐS thuộc cụm hợp thửa/công trình, chuyển toàn bộ cụm. */
  async transferOwnership(client: Db, propertyId: string, buyerCharacterId: string): Promise<void> {
    const info = await client.query<{
      id: string;
      mergeGroupId: string | null;
      mergedIntoPropertyId: string | null;
    }>(
      `SELECT id, merge_group_id AS "mergeGroupId", merged_into_property_id AS "mergedIntoPropertyId"
       FROM properties WHERE id = $1`,
      [propertyId],
    );
    const row = info.rows[0];
    if (!row) return;

    let groupId: string | null = row.mergeGroupId;
    if (!groupId && row.mergedIntoPropertyId) {
      const parent = await client.query<{ mergeGroupId: string | null }>(
        `SELECT merge_group_id AS "mergeGroupId" FROM properties WHERE id = $1`,
        [row.mergedIntoPropertyId],
      );
      groupId = parent.rows[0]?.mergeGroupId ?? null;
    }

    if (groupId) {
      await client.query(
        `UPDATE properties
         SET owner_character_id = $2, owner_company_id = NULL,
             status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now()
         WHERE merge_group_id = $1
           AND status IN ('owned', 'unowned', 'listed')`,
        [groupId, buyerCharacterId],
      );
      return;
    }

    await client.query(
      `UPDATE properties
       SET owner_character_id = $2, owner_company_id = NULL,
           status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now()
       WHERE id = $1 AND status IN ('owned', 'unowned', 'listed')`,
      [propertyId, buyerCharacterId],
    );
  }

  async list(
    client: Db,
    propertyId: string,
    askingPriceMinor: number,
    saleNotes: string | null,
  ): Promise<void> {
    await client.query(
      `UPDATE properties
       SET asking_price_minor = $2, sale_notes = $3, status = 'listed', updated_at = now()
       WHERE id = $1 AND status = 'owned'`,
      [propertyId, askingPriceMinor, saleNotes],
    );
  }

  async unlist(client: Db, propertyId: string): Promise<void> {
    await client.query(
      `UPDATE properties
       SET status = 'owned', asking_price_minor = NULL, sale_notes = NULL, updated_at = now()
       WHERE id = $1 AND status = 'listed'`,
      [propertyId],
    );
  }

  async updateRentTerms(
    client: Db,
    propertyId: string,
    input: {
      monthlyRentMinor: number;
      rentDepositMinor: number;
      rentListingActive: boolean;
      rentNotes: string | null;
    },
  ): Promise<void> {
    await client.query(
      `UPDATE properties
       SET monthly_rent_minor = $2, rent_deposit_minor = $3, rent_listing_active = $4, rent_notes = $5, updated_at = now()
       WHERE id = $1`,
      [propertyId, input.monthlyRentMinor, input.rentDepositMinor, input.rentListingActive, input.rentNotes],
    );
  }

  async rent(
    client: Db,
    propertyId: string,
    tenantCharacterId: string,
    monthlyRentMinor: number,
  ): Promise<void> {
    await client.query(
      `INSERT INTO leases (id, property_id, tenant_character_id, monthly_rent_minor, status, next_due_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'active', now() + interval '1 month')`,
      [propertyId, tenantCharacterId, monthlyRentMinor],
    );
  }

  async listOffersByPropertyIds(propertyIds: string[]): Promise<PropertySaleOfferRow[]> {
    if (propertyIds.length === 0) return [];
    const result = await this.db.query<PropertySaleOfferRow>(
      `SELECT o.id, o.property_id AS "propertyId", o.buyer_character_id AS "buyerCharacterId",
              c.full_name AS "buyerName", o.seller_character_id AS "sellerCharacterId",
              o.amount_minor AS "amountMinor", o.status, o.message,
              o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.resolved_at AS "resolvedAt"
       FROM property_sale_offers o
       LEFT JOIN characters c ON c.id = o.buyer_character_id
       WHERE o.property_id = ANY($1::uuid[]) AND o.status = 'pending'
       ORDER BY o.created_at DESC`,
      [propertyIds],
    );
    return result.rows;
  }

  async createOffer(
    db: Db,
    input: {
      propertyId: string;
      buyerCharacterId: string;
      sellerCharacterId: string;
      amountMinor: number;
      message: string | null;
    },
  ): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO property_sale_offers (property_id, buyer_character_id, seller_character_id, amount_minor, status, message)
       VALUES ($1,$2,$3,$4,'pending',$5) RETURNING id`,
      [input.propertyId, input.buyerCharacterId, input.sellerCharacterId, input.amountMinor, input.message],
    );
    return result.rows[0]!.id;
  }

  async findOfferById(db: Db, offerId: string): Promise<PropertySaleOfferRow | null> {
    const result = await db.query<PropertySaleOfferRow>(
      `SELECT o.id, o.property_id AS "propertyId", o.buyer_character_id AS "buyerCharacterId",
              c.full_name AS "buyerName", o.seller_character_id AS "sellerCharacterId",
              o.amount_minor AS "amountMinor", o.status, o.message,
              o.created_at AS "createdAt", o.updated_at AS "updatedAt", o.resolved_at AS "resolvedAt"
       FROM property_sale_offers o
       LEFT JOIN characters c ON c.id = o.buyer_character_id
       WHERE o.id = $1`,
      [offerId],
    );
    return result.rows[0] ?? null;
  }

  async resolveOffer(
    db: Db,
    offerId: string,
    status: 'accepted' | 'rejected' | 'cancelled' | 'expired',
  ): Promise<void> {
    await db.query(
      `UPDATE property_sale_offers SET status = $2, resolved_at = now(), updated_at = now() WHERE id = $1`,
      [offerId, status],
    );
  }

  async rejectOtherPendingOffers(db: Db, propertyId: string, exceptOfferId: string): Promise<void> {
    await db.query(
      `UPDATE property_sale_offers SET status = 'rejected', resolved_at = now(), updated_at = now()
       WHERE property_id = $1 AND id <> $2 AND status = 'pending'`,
      [propertyId, exceptOfferId],
    );
  }

  async findByIds(db: Db, ids: string[]): Promise<PropertyRow[]> {
    if (ids.length === 0) return [];
    const result = await db.query<PropertyRow>(
      `${PROPERTY_SELECT} WHERE p.id = ANY($1::uuid[])`,
      [ids],
    );
    return result.rows;
  }

  async applyConstruction(
    db: Db,
    input: {
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
    },
  ): Promise<void> {
    await db.query(
      `UPDATE properties
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
           asking_price_minor = NULL,
           sale_notes = NULL,
           status = 'owned',
           updated_at = now()
       WHERE id = $1`,
      [
        input.primaryId,
        input.optionId,
        input.label,
        input.tier,
        input.multiplier,
        input.costMinor,
        input.mergeGroupId,
        input.newPropertyType,
        input.newCurrentValueMinor,
        input.newMonthlyRentMinor,
      ],
    );

    if (input.memberIds.length > 0 && input.mergeGroupId) {
      await db.query(
        `UPDATE properties
         SET merge_group_id = $2,
             merged_into_property_id = $1,
             construction_option = $3,
             construction_label = $4,
             construction_tier = $5,
             construction_multiplier = 1,
             construction_cost_minor = 0,
             construction_built_at = now(),
             monthly_rent_minor = 0,
             rent_listing_active = false,
             asking_price_minor = NULL,
             sale_notes = NULL,
             status = 'owned',
             updated_at = now()
         WHERE id = ANY($6::uuid[])`,
        [
          input.primaryId,
          input.mergeGroupId,
          input.optionId,
          input.label,
          input.tier,
          input.memberIds,
        ],
      );
    }
  }

  async findGroupPropertyIds(db: Db, propertyId: string): Promise<string[]> {
    const info = await db.query<{
      id: string;
      mergeGroupId: string | null;
      mergedIntoPropertyId: string | null;
    }>(
      `SELECT id, merge_group_id AS "mergeGroupId", merged_into_property_id AS "mergedIntoPropertyId"
       FROM properties WHERE id = $1`,
      [propertyId],
    );
    const row = info.rows[0];
    if (!row) return [];
    let groupId: string | null = row.mergeGroupId;
    if (!groupId && row.mergedIntoPropertyId) {
      const parent = await db.query<{ mergeGroupId: string | null }>(
        `SELECT merge_group_id AS "mergeGroupId" FROM properties WHERE id = $1`,
        [row.mergedIntoPropertyId],
      );
      groupId = parent.rows[0]?.mergeGroupId ?? null;
    }
    if (!groupId) return [propertyId];
    const r = await db.query<{ id: string }>(
      `SELECT id FROM properties WHERE merge_group_id = $1`,
      [groupId],
    );
    const ids = r.rows.map((x) => x.id);
    return ids.length > 0 ? ids : [propertyId];
  }

  async demolishToLand(db: Db, propertyIds: string[]): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE properties
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
           rent_listing_active = false,
           rent_deposit_minor = 0,
           rent_notes = NULL,
           asking_price_minor = NULL,
           sale_notes = NULL,
           current_value_minor = purchase_price_minor,
           updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [propertyIds],
    );
  }

  async cancelPendingOffersForProperties(db: Db, propertyIds: string[]): Promise<void> {
    if (propertyIds.length === 0) return;
    await db.query(
      `UPDATE property_sale_offers
       SET status = 'cancelled', resolved_at = now(), updated_at = now()
       WHERE property_id = ANY($1::uuid[]) AND status = 'pending'`,
      [propertyIds],
    );
  }
}

export const realEstateRepository = new RealEstateRepository();
