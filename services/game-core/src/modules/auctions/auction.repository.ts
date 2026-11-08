import type { Db } from '../../shared/db/tx.js';
import { pool } from '../../shared/db/pool.js';

export interface AuctionRow {
  id: string;
  propertyId: string;
  propertyName: string;
  sellerCharacterId: string;
  sellerName: string;
  startingPriceMinor: string;
  currentBidMinor: string;
  highestBidderId: string | null;
  highestBidderName: string | null;
  endsAt: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateAuctionInput {
  propertyId: string;
  sellerCharacterId: string;
  startingPriceMinor: number;
  endsAt: Date;
}

interface PlaceBidInput {
  auctionId: string;
  bidderCharacterId: string;
  amountMinor: number;
}

/** Truy cập bảng auctions (đấu giá tài sản phát mại). */
export class AuctionRepository {
  constructor(readonly db: Db = pool) {}

  /** Danh sách phiên đấu giá đang mở, sắp xếp theo thời gian kết thúc sớm nhất. */
  async listOpenAuctions(): Promise<AuctionRow[]> {
    const result = await this.db.query<AuctionRow>(
      `SELECT a.id, a.property_id AS "propertyId", m.name AS "propertyName",
              a.seller_character_id AS "sellerCharacterId",
              c.full_name AS "sellerName",
              a.starting_price_minor AS "startingPriceMinor",
              a.current_bid_minor AS "currentBidMinor",
              a.highest_bidder_id AS "highestBidderId",
              cb.full_name AS "highestBidderName",
              a.ends_at AS "endsAt", a.status, a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
       FROM auctions a
       JOIN properties p ON p.id = a.property_id
       JOIN map_nodes m ON m.id = p.node_id
       JOIN characters c ON c.id = a.seller_character_id
       LEFT JOIN characters cb ON cb.id = a.highest_bidder_id
       WHERE a.status = 'open'
       ORDER BY a.ends_at ASC`,
    );
    return result.rows;
  }

  async getAuction(id: string): Promise<AuctionRow | null> {
    const result = await this.db.query<AuctionRow>(
      `SELECT a.id, a.property_id AS "propertyId", m.name AS "propertyName",
              a.seller_character_id AS "sellerCharacterId",
              c.full_name AS "sellerName",
              a.starting_price_minor AS "startingPriceMinor",
              a.current_bid_minor AS "currentBidMinor",
              a.highest_bidder_id AS "highestBidderId",
              cb.full_name AS "highestBidderName",
              a.ends_at AS "endsAt", a.status, a.created_at AS "createdAt",
              a.updated_at AS "updatedAt"
       FROM auctions a
       JOIN properties p ON p.id = a.property_id
       JOIN map_nodes m ON m.id = p.node_id
       JOIN characters c ON c.id = a.seller_character_id
       LEFT JOIN characters cb ON cb.id = a.highest_bidder_id
       WHERE a.id = $1`,
      [id],
    );
    return result.rows[0] ?? null;
  }

  /** Tạo phiên đấu giá mới cho một bất động sản (chỉ admin). */
  async createAuction(db: Db, input: CreateAuctionInput): Promise<string> {
    const result = await db.query<{ id: string }>(
      `INSERT INTO auctions (id, property_id, seller_character_id,
              starting_price_minor, current_bid_minor, ends_at, status)
       VALUES (gen_random_uuid(), $1, $2, $3, $3, $4, 'open')
       RETURNING id`,
      [input.propertyId, input.sellerCharacterId, input.startingPriceMinor, input.endsAt],
    );
    return result.rows[0]!.id;
  }

  /** Hủy phiên đấu giá (chỉ admin). */
  async cancelAuction(db: Db, auctionId: string): Promise<void> {
    await db.query(
      `UPDATE auctions SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND status = 'open'`,
      [auctionId],
    );
  }

  /** Lấy thông tin một bất động sản (dùng khi tạo đấu giá). */
  async getPropertyById(
    db: Db,
    propertyId: string,
  ): Promise<{
    id: string;
    name: string;
    ownerCharacterId: string | null;
    status: string;
  } | null> {
    const result = await db.query(
      `SELECT p.id, m.name AS "name", p.owner_character_id AS "ownerCharacterId", p.status
       FROM properties p
       JOIN map_nodes m ON m.id = p.node_id
       WHERE p.id = $1`,
      [propertyId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Đặt giá vào phiên đấu giá. Phải gọi bên trong giao dịch.
   * Trả về giá cao nhất mới sau khi đặt.
   */
  async placeBid(
    db: Db,
    input: PlaceBidInput,
  ): Promise<{ currentBidMinor: number; highestBidderId: string }> {
    const result = await db.query<{ current_bid_minor: string }>(
      `UPDATE auctions
       SET current_bid_minor = $2::bigint, highest_bidder_id = $3::uuid, updated_at = now()
       WHERE id = $1::uuid AND status = 'open' AND $2::bigint > current_bid_minor
       RETURNING current_bid_minor`,
      [input.auctionId, input.amountMinor, input.bidderCharacterId],
    );
    if (!result.rows[0]) {
      throw new Error('Không thể đặt giá (phiên đã kết thúc hoặc giá quá thấp)');
    }
    return {
      currentBidMinor: Number(result.rows[0].current_bid_minor),
      highestBidderId: input.bidderCharacterId,
    };
  }

  /** Kết thúc phiên đấu giá: chuyển chủ sở hữu proprietà nếu có Bid. */
  async endAuction(db: Db, auctionId: string): Promise<{ winnerId: string | null }> {
    const result = await db.query<{ highest_bidder_id: string | null }>(
      `UPDATE auctions SET status = 'ended', updated_at = now()
       WHERE id = $1 AND status = 'open'
       RETURNING highest_bidder_id`,
      [auctionId],
    );
    return { winnerId: result.rows[0]?.highest_bidder_id ?? null };
  }
}

export const auctionRepository = new AuctionRepository();
