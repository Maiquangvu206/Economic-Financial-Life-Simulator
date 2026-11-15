import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface ProvinceLandAuctionRow {
  id: string;
  provinceCode: string;
  nodeX: number;
  nodeY: number;
  zoneType: string;
  nodeName: string;
  startingPriceMinor: string;
  currentBidMinor: string;
  highestBidderId: string | null;
  highestBidderName: string | null;
  endsAt: Date;
  status: string;
  winnerId: string | null;
  settledPriceMinor: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ProvinceLandAuctionRepository {
  constructor(readonly db: Db = pool) {}

  async listOpenByProvince(provinceCode: string): Promise<ProvinceLandAuctionRow[]> {
    const result = await this.db.query<ProvinceLandAuctionRow>(
      `SELECT a.id,
              a.province_code AS "provinceCode",
              a.node_x AS "nodeX",
              a.node_y AS "nodeY",
              a.zone_type AS "zoneType",
              a.node_name AS "nodeName",
              a.starting_price_minor AS "startingPriceMinor",
              a.current_bid_minor AS "currentBidMinor",
              a.highest_bidder_id AS "highestBidderId",
              cb.full_name AS "highestBidderName",
              a.ends_at AS "endsAt",
              a.status,
              a.winner_id AS "winnerId",
              a.settled_price_minor AS "settledPriceMinor",
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
       FROM province_land_auctions a
       LEFT JOIN characters cb ON cb.id = a.highest_bidder_id
       WHERE a.province_code = $1 AND a.status = 'open'
       ORDER BY a.ends_at ASC`,
      [provinceCode],
    );
    return result.rows;
  }

  async getById(id: string): Promise<ProvinceLandAuctionRow | null> {
    const result = await this.db.query<ProvinceLandAuctionRow>(
      `SELECT a.id,
              a.province_code AS "provinceCode",
              a.node_x AS "nodeX",
              a.node_y AS "nodeY",
              a.zone_type AS "zoneType",
              a.node_name AS "nodeName",
              a.starting_price_minor AS "startingPriceMinor",
              a.current_bid_minor AS "currentBidMinor",
              a.highest_bidder_id AS "highestBidderId",
              cb.full_name AS "highestBidderName",
              a.ends_at AS "endsAt",
              a.status,
              a.winner_id AS "winnerId",
              a.settled_price_minor AS "settledPriceMinor",
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
       FROM province_land_auctions a
       LEFT JOIN characters cb ON cb.id = a.highest_bidder_id
       WHERE a.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  async listExpiredOpen(now: Date): Promise<ProvinceLandAuctionRow[]> {
    const result = await this.db.query<ProvinceLandAuctionRow>(
      `SELECT a.id,
              a.province_code AS "provinceCode",
              a.node_x AS "nodeX",
              a.node_y AS "nodeY",
              a.zone_type AS "zoneType",
              a.node_name AS "nodeName",
              a.starting_price_minor AS "startingPriceMinor",
              a.current_bid_minor AS "currentBidMinor",
              a.highest_bidder_id AS "highestBidderId",
              cb.full_name AS "highestBidderName",
              a.ends_at AS "endsAt",
              a.status,
              a.winner_id AS "winnerId",
              a.settled_price_minor AS "settledPriceMinor",
              a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
       FROM province_land_auctions a
       LEFT JOIN characters cb ON cb.id = a.highest_bidder_id
       WHERE a.status = 'open' AND a.ends_at <= $1
       ORDER BY a.ends_at ASC`,
      [now],
    );
    return result.rows;
  }

  async create(db: Db, input: {
    provinceCode: string;
    nodeX: number;
    nodeY: number;
    zoneType: string;
    nodeName: string;
    startingPriceMinor: number;
    endsAt: Date;
  }): Promise<string | null> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO province_land_auctions (
         id, province_code, node_x, node_y, zone_type, node_name,
         starting_price_minor, current_bid_minor, ends_at, status
       ) VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,$6,$7,'open')
       ON CONFLICT (province_code) WHERE status = 'open' DO NOTHING
       RETURNING id`,
      [
        input.provinceCode,
        input.nodeX,
        input.nodeY,
        input.zoneType,
        input.nodeName,
        input.startingPriceMinor,
        input.endsAt,
      ],
    );
    return result.rows[0]?.id ?? null;
  }

  async placeBid(db: Db, input: { auctionId: string; bidderCharacterId: string; amountMinor: number }): Promise<void> {
    const result = await db.query<{ id: string }>(
      `UPDATE province_land_auctions
       SET current_bid_minor = $2::bigint,
           highest_bidder_id = $3::uuid,
           updated_at = now()
       WHERE id = $1::uuid AND status = 'open' AND $2::bigint > current_bid_minor
       RETURNING id`,
      [input.auctionId, input.amountMinor, input.bidderCharacterId],
    );
    if (!result.rows[0]) {
      throw new Error('Không thể đặt giá (phiên đã kết thúc hoặc giá quá thấp)');
    }
  }

  async endAuction(db: Db, auctionId: string): Promise<{ winnerId: string | null; settledPriceMinor: number }> {
    const result = await db.query<{ highest_bidder_id: string | null; current_bid_minor: string }>(
      `UPDATE province_land_auctions
       SET status = 'ended',
           winner_id = highest_bidder_id,
           settled_price_minor = CASE WHEN highest_bidder_id IS NULL THEN 0 ELSE current_bid_minor END,
           updated_at = now()
       WHERE id = $1 AND status = 'open'
       RETURNING highest_bidder_id, current_bid_minor`,
      [auctionId],
    );
    return {
      winnerId: result.rows[0]?.highest_bidder_id ?? null,
      settledPriceMinor: result.rows[0] ? Number(result.rows[0].current_bid_minor) : 0,
    };
  }
}

export const provinceLandAuctionRepository = new ProvinceLandAuctionRepository();
