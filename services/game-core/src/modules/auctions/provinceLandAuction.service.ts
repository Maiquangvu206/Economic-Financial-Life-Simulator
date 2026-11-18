import { generateProvinceMap, provinceByCode } from '@efls/domain';
import type { AuctionDto } from '@efls/contracts';
import { MoneySchema } from '@efls/contracts';
import type { PoolClient } from 'pg';
import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { creditStateFund } from '../../shared/state-fund/stateFund.js';
import { notify } from '../notifications/notification.service.js';
import { mapRepository } from '../map/map.repository.js';
import { defaultProvinceLandPrice } from '../map/provinceLandPrices.js';
import { pool } from '../../shared/db/pool.js';
import { provinceLandAuctionRepository, type ProvinceLandAuctionRow } from './provinceLandAuction.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toDto(row: ProvinceLandAuctionRow, viewerCharacterId: string): AuctionDto {
  return {
    id: row.id,
    propertyId: null,
    propertyName: `${row.nodeName} (${row.provinceCode})`,
    sellerCharacterId: null,
    sellerName: 'AI Game Master',
    startingPrice: money(Number(row.startingPriceMinor)),
    currentBid: money(Number(row.currentBidMinor)),
    highestBidderId: row.highestBidderId,
    highestBidderName: row.highestBidderName,
    endsAt: row.endsAt.toISOString(),
    status: row.status as AuctionDto['status'],
    createdAt: row.createdAt.toISOString(),
    isMine: false,
    isHighestBidder: row.highestBidderId === viewerCharacterId,
    provinceCode: row.provinceCode,
    location: { x: row.nodeX, y: row.nodeY },
    zoneType: row.zoneType,
    source: 'province_land',
  };
}

async function notifyCharacter(db: PoolClient, characterId: string, input: { kind: string; title: string; body: string; payload?: Record<string, unknown> }) {
  const result = await db.query<{ user_id: string }>(`SELECT user_id FROM characters WHERE id = $1`, [characterId]);
  const userId = result.rows[0]?.user_id;
  if (!userId) return;
  await notify(db, { userId, ...input });
}

export class ProvinceLandAuctionService {
  constructor(private readonly repo = provinceLandAuctionRepository) {}

  async listOpenForProvince(userId: string, provinceCode: string): Promise<AuctionDto[]> {
    const character = await requireCharacterByUserId(pool, userId);
    const rows = await this.repo.listOpenByProvince(provinceCode);
    return rows.map((r) => toDto(r, character.id));
  }

  async get(userId: string, auctionId: string): Promise<AuctionDto | null> {
    const character = await requireCharacterByUserId(pool, userId);
    const row = await this.repo.getById(auctionId);
    return row ? toDto(row, character.id) : null;
  }

  async settleExpiredForProvince(provinceCode: string, now: Date = new Date()): Promise<number> {
    const expired = await this.repo.listExpiredOpen(now);
    let count = 0;
    for (const auction of expired) {
      if (auction.provinceCode !== provinceCode) continue;
      count += 1;
      await withTransaction(async (client) => {
        const result = await this.repo.endAuction(client, auction.id);
        if (result.winnerId && result.settledPriceMinor > 0) {
          await creditStateFund(
            client,
            { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID, kind: 'cash' },
            result.settledPriceMinor,
            {
              amountMinor: result.settledPriceMinor,
              reasonCode: 'province_land_auction',
              description: `Thanh toán đấu giá đất chưa chủ sở hữu ${auction.id} (${auction.provinceCode})`,
              refType: 'province_land_auction',
              refId: auction.id,
              actorType: 'system',
              ledgerKind: 'auction_settlement',
              ledgerDescription: `Thanh toán đấu giá đất ${auction.id} vào quỹ đất nước`,
              meta: { provinceCode: auction.provinceCode, x: auction.nodeX, y: auction.nodeY },
            },
          );
          // Grant province land ownership so the winner can build/merge on this map tile.
          await client.query(
            `INSERT INTO province_land_properties (
               id, province_code, node_x, node_y, zone_type, node_name,
               owner_character_id, status, purchase_price_minor, current_value_minor, monthly_rent_minor, property_type
             ) VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,'owned',$7,$7,0,'land')
             ON CONFLICT (province_code, node_x, node_y) DO UPDATE
             SET owner_character_id = EXCLUDED.owner_character_id,
                 status = 'owned',
                 purchase_price_minor = EXCLUDED.purchase_price_minor,
                 current_value_minor = GREATEST(province_land_properties.current_value_minor, EXCLUDED.current_value_minor),
                 updated_at = now()`,
            [
              auction.provinceCode,
              auction.nodeX,
              auction.nodeY,
              auction.zoneType,
              auction.nodeName,
              result.winnerId,
              result.settledPriceMinor,
            ],
          );
          await notifyCharacter(client, result.winnerId, {
            kind: 'auction',
            title: 'Bạn thắng đấu giá đất',
            body: `Bạn đã thắng và sở hữu "${auction.nodeName}" tại ${auction.provinceCode} với giá ${result.settledPriceMinor.toLocaleString('vi-VN')} VND.`,
            payload: { auctionId: auction.id, provinceCode: auction.provinceCode, x: auction.nodeX, y: auction.nodeY, priceMinor: result.settledPriceMinor },
          });
        } else if (auction.highestBidderId && Number(auction.currentBidMinor) > 0) {
          await ledger.transfer(client, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'character', ownerId: auction.highestBidderId },
            amountMinor: Number(auction.currentBidMinor),
            kind: 'auction_cancel_refund',
            description: `Hoàn tiền đấu giá đất ${auction.id}`,
            referenceType: 'province_land_auction',
            referenceId: auction.id,
          });
        }
      });
    }
    return count;
  }

  async ensureOpenAuction(provinceCode: string, now: Date = new Date()): Promise<boolean> {
    const code = (provinceCode ?? '001').trim() || '001';
    if (!provinceByCode(code)) return false;

    // Settle expired auction(s) for this province first so a new one can be created.
    try {
      await this.settleExpiredForProvince(code, now);
    } catch {
      // best-effort
    }

    const existing = await this.repo.listOpenByProvince(code);
    if (existing.length > 0) return false;

    const [map, savedPrices, existingLand] = await Promise.all([
      code === '001' ? mapRepository.getMap() : Promise.resolve(null),
      code === '001' ? Promise.resolve(null) : mapRepository.getProvinceLandPrices(pool, code),
      pool.query<{ node_x: number; node_y: number }>(
        `SELECT node_x, node_y FROM province_land_properties WHERE province_code = $1`,
        [code],
      ),
    ]);
    const existingCoords = new Set(existingLand.rows.map((row) => `${row.node_x}-${row.node_y}`));
    if (code === '001') {
      const legacyProperties = await pool.query<{ x: number; y: number }>(
        `SELECT m.x, m.y FROM properties p JOIN map_nodes m ON m.id = p.node_id`,
      );
      for (const row of legacyProperties.rows) existingCoords.add(`${row.x}-${row.y}`);
    }

    const nodes = code === '001'
      ? (map?.nodes ?? []).map((n) => ({
          x: n.x,
          y: n.y,
          zone: n.zoneType,
          name: n.name,
          price: Number(n.landPriceMinor) || 0,
        }))
      : generateProvinceMap(code).nodes.map((n) => ({
          x: n.x,
          y: n.y,
          zone: n.zone,
          name: n.name,
          price: savedPrices?.get(`${n.x}-${n.y}`) ?? defaultProvinceLandPrice(n.zone),
        }));
    const candidates = nodes.filter((n) =>
      n.zone !== 'water' && n.zone !== 'park' && n.price > 0 && !existingCoords.has(`${n.x}-${n.y}`),
    );
    if (candidates.length === 0) return false;

    // Chuẩn thời gian: 1 phiên đấu giá = 3 ngày game = 3 phút thực
    const AUCTION_DURATION_MS = 3 * 60 * 1000;
    // Deterministic-ish rotation by time bucket + province to vary per province over time
    const bucket = Math.floor(now.getTime() / AUCTION_DURATION_MS);
    let hash = 0;
    const seedStr = `${code}:${bucket}`;
    for (let i = 0; i < seedStr.length; i += 1) hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    const pick = candidates[hash % candidates.length]!;
    const startingPriceMinor = pick.price;
    if (startingPriceMinor <= 0) return false;

    const endsAt = new Date(now.getTime() + AUCTION_DURATION_MS);

    return withTransaction(async (client) => {
      const auctionId = await this.repo.create(client, {
        provinceCode: code,
        nodeX: pick.x,
        nodeY: pick.y,
        zoneType: pick.zone,
        nodeName: pick.name,
        startingPriceMinor,
        endsAt,
      });
      return auctionId !== null;
    });
  }

  async ensureOpenAuctionsForAllProvinces(now: Date = new Date()): Promise<number> {
    const provinces = await pool.query<{ code: string }>(`SELECT code FROM provinces ORDER BY code ASC`);
    let opened = 0;
    for (const p of provinces.rows) {
      try {
        if (await this.ensureOpenAuction(p.code, now)) opened += 1;
      } catch (error) {
        console.error(`Không thể mở đấu giá đất tỉnh ${p.code}:`, error);
      }
    }
    return opened;
  }

  async placeBid(userId: string, auctionId: string, amountMinor: number): Promise<AuctionDto> {
    return withTransaction(async (client) => {
      const character = await requireLivingCharacterByUserId(client, userId);
      const auction = await this.repo.getById(auctionId);
      if (!auction) throw AppError.notFound('Auction');
      if (auction.status !== 'open') throw AppError.badRequest('Phiên đấu giá này đã kết thúc.');
      const now = new Date();
      if (now >= auction.endsAt) throw AppError.badRequest('Phiên đấu giá đã hết hạn.');
      if (amountMinor <= Number(auction.currentBidMinor)) {
        throw AppError.badRequest(
          `Giá đặt phải cao hơn giá hiện tại (${Number(auction.currentBidMinor).toLocaleString('vi-VN')} VND).`,
        );
      }
      const cash = toMinor(character.cash_minor);
      if (cash < amountMinor) throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để đặt giá.');

      if (auction.highestBidderId) {
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: auction.highestBidderId },
          amountMinor: Number(auction.currentBidMinor),
          kind: 'auction_bid_refund',
          description: `Hoàn tiền đấu giá đất ${auctionId}`,
          referenceType: 'province_land_auction',
          referenceId: auctionId,
        });
      }

      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
        amountMinor,
        kind: 'auction_bid',
        description: `Đặt giá đấu giá đất ${auctionId}`,
        referenceType: 'province_land_auction',
        referenceId: auctionId,
      });

      await this.repo.placeBid(client, { auctionId, bidderCharacterId: character.id, amountMinor });

      await notify(client, {
        userId,
        kind: 'auction',
        title: 'Đã đặt giá đấu giá đất',
        body: `Bạn vừa đặt giá ${amountMinor.toLocaleString('vi-VN')} VND cho "${auction.nodeName}" (${auction.provinceCode}).`,
        payload: { auctionId, provinceCode: auction.provinceCode, x: auction.nodeX, y: auction.nodeY, amountMinor },
      });

      const dto = await this.repo.getById(auctionId);
      if (!dto) throw new Error('Auction disappeared during bid');
      return toDto(dto, character.id);
    });
  }

  async settleExpired(now: Date = new Date()): Promise<number> {
    const expired = await this.repo.listExpiredOpen(now);
    for (const auction of expired) {
      await withTransaction(async (client) => {
        const result = await this.repo.endAuction(client, auction.id);
        if (result.winnerId && result.settledPriceMinor > 0) {
          // GM/system land sale: escrow goes to national/state land fund
          await creditStateFund(
            client,
            { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID, kind: 'cash' },
            result.settledPriceMinor,
            {
              amountMinor: result.settledPriceMinor,
              reasonCode: 'province_land_auction',
              description: `Thanh toán đấu giá đất chưa chủ sở hữu ${auction.id} (${auction.provinceCode})`,
              refType: 'province_land_auction',
              refId: auction.id,
              actorType: 'system',
              ledgerKind: 'auction_settlement',
              ledgerDescription: `Thanh toán đấu giá đất ${auction.id} vào quỹ đất nước`,
              meta: { provinceCode: auction.provinceCode, x: auction.nodeX, y: auction.nodeY },
            },
          );
          // Cấp quyền sở hữu đất tỉnh cho người thắng (đồng bộ với settleExpiredForProvince).
          await client.query(
            `INSERT INTO province_land_properties (
               id, province_code, node_x, node_y, zone_type, node_name,
               owner_character_id, status, purchase_price_minor, current_value_minor, monthly_rent_minor, property_type
             ) VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,$6,'owned',$7,$7,0,'land')
             ON CONFLICT (province_code, node_x, node_y) DO UPDATE
             SET owner_character_id = EXCLUDED.owner_character_id,
                 status = 'owned',
                 purchase_price_minor = EXCLUDED.purchase_price_minor,
                 current_value_minor = GREATEST(province_land_properties.current_value_minor, EXCLUDED.current_value_minor),
                 updated_at = now()`,
            [
              auction.provinceCode,
              auction.nodeX,
              auction.nodeY,
              auction.zoneType,
              auction.nodeName,
              result.winnerId,
              result.settledPriceMinor,
            ],
          );
          await notifyCharacter(client, result.winnerId, {
            kind: 'auction',
            title: 'Bạn thắng đấu giá đất',
            body: `Bạn đã thắng phiên đấu giá "${auction.nodeName}" tại ${auction.provinceCode} với giá ${result.settledPriceMinor.toLocaleString('vi-VN')} VND.`,
            payload: { auctionId: auction.id, provinceCode: auction.provinceCode, x: auction.nodeX, y: auction.nodeY, priceMinor: result.settledPriceMinor },
          });
        } else if (auction.highestBidderId && Number(auction.currentBidMinor) > 0) {
          // safety: should not happen, but refund if any
          await ledger.transfer(client, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'character', ownerId: auction.highestBidderId },
            amountMinor: Number(auction.currentBidMinor),
            kind: 'auction_cancel_refund',
            description: `Hoàn tiền đấu giá đất ${auction.id}`,
            referenceType: 'province_land_auction',
            referenceId: auction.id,
          });
        }
      });
    }
    return expired.length;
  }
}

export const provinceLandAuctionService = new ProvinceLandAuctionService();
