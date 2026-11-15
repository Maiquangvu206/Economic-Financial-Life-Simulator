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
  createdAt: Date;
  updatedAt: Date;
}

export class ProvinceLandRepository {
  constructor(readonly db: Db = pool) {}

  async listByProvince(provinceCode: string): Promise<ProvinceLandPropertyRow[]> {
    const r = await this.db.query<ProvinceLandPropertyRow>(
      `SELECT id,
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
              created_at AS "createdAt",
              updated_at AS "updatedAt"
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
      `SELECT id,
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
              created_at AS "createdAt",
              updated_at AS "updatedAt"
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
}

export const provinceLandRepository = new ProvinceLandRepository();
