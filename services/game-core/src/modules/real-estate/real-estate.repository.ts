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
}

export interface LeaseRow {
  id: string;
  propertyId: string;
  tenantCharacterId: string;
  monthlyRentMinor: string;
  status: string;
  startedAt: Date;
  endsAt: Date | null;
  nextDueAt: Date;
}

/** Truy cập bảng properties và leases (bất động sản), join map_nodes để lấy vị trí/vùng. */
export class RealEstateRepository {
  constructor(readonly db: Db = pool) {}

  async listProperties(): Promise<PropertyRow[]> {
    const result = await this.db.query<PropertyRow>(
      `SELECT p.id, p.node_id AS "nodeId", m.name AS "nodeName", m.x AS "nodeX", m.y AS "nodeY",
              m.zone_type AS "nodeZoneType",
              p.owner_character_id AS "ownerCharacterId", p.owner_company_id AS "ownerCompanyId",
              p.property_type AS "propertyType", p.purchase_price_minor AS "purchasePriceMinor",
              p.current_value_minor AS "currentValueMinor",
              p.monthly_rent_minor AS "monthlyRentMinor",
              p.asking_price_minor AS "askingPriceMinor",
              p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM properties p
       JOIN map_nodes m ON p.node_id = m.id
       ORDER BY p.created_at DESC`,
    );
    return result.rows;
  }

  async findById(id: string, db: Db = this.db): Promise<PropertyRow | null> {
    const result = await db.query<PropertyRow>(
      `SELECT p.id, p.node_id AS "nodeId", m.name AS "nodeName", m.x AS "nodeX", m.y AS "nodeY",
              m.zone_type AS "nodeZoneType",
              p.owner_character_id AS "ownerCharacterId", p.owner_company_id AS "ownerCompanyId",
              p.property_type AS "propertyType", p.purchase_price_minor AS "purchasePriceMinor",
              p.current_value_minor AS "currentValueMinor",
              p.monthly_rent_minor AS "monthlyRentMinor",
              p.asking_price_minor AS "askingPriceMinor",
              p.status, p.created_at AS "createdAt", p.updated_at AS "updatedAt"
       FROM properties p
       JOIN map_nodes m ON p.node_id = m.id
       WHERE p.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Danh sách hợp đồng thuê đang active của một nhân vật. */
  async listActiveLeasesByCharacter(characterId: string): Promise<LeaseRow[]> {
    const result = await this.db.query<LeaseRow>(
      `SELECT id, property_id AS "propertyId", tenant_character_id AS "tenantCharacterId",
              monthly_rent_minor AS "monthlyRentMinor", status, started_at AS "startedAt",
              ends_at AS "endsAt", next_due_at AS "nextDueAt"
       FROM leases
       WHERE tenant_character_id = $1 AND status = 'active'`,
      [characterId],
    );
    return result.rows;
  }

  /** Có hợp đồng thuê đang active nào trên bất động sản này không? */
  async hasActiveLease(client: Db, propertyId: string): Promise<boolean> {
    const result = await client.query<{ count: string }>(
      `SELECT count(*) AS count FROM leases WHERE property_id = $1 AND status = 'active'`,
      [propertyId],
    );
    return Number(result.rows[0]?.count ?? 0) > 0;
  }

  async buy(client: Db, propertyId: string, buyerCharacterId: string): Promise<void> {
    await client.query(
      `UPDATE properties
       SET owner_character_id = $2, owner_company_id = NULL,
           status = 'owned', updated_at = now()
       WHERE id = $1 AND status IN ('unowned', 'listed')`,
      [propertyId, buyerCharacterId],
    );
  }

  async list(client: Db, propertyId: string, askingPriceMinor: number): Promise<void> {
    await client.query(
      `UPDATE properties
       SET asking_price_minor = $2, status = 'listed', updated_at = now()
       WHERE id = $1 AND status = 'owned'`,
      [propertyId, askingPriceMinor],
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
}

export const realEstateRepository = new RealEstateRepository();
