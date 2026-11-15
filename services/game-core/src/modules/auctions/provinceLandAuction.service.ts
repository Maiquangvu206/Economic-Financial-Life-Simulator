import { generateProvinceMap, provinceByCode } from '@efls/domain';
import type { AuctionDto } from '@efls/contracts';
import { MoneySchema } from '@efls/contracts';
import type { PoolClient } from 'pg';
import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId, requireLivingCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID, SYSTEM_MARKET_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { mapRepository } from '../map/map.repository.js';
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
          await ledger.transfer(client, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
            amountMinor: result.settledPriceMinor,
            kind: 'auction_settlement',
            description: `Thanh toán đấu giá đất ${auction.id}`,
            referenceType: 'province_land_auction',
            referenceId: auction.id,
          });
          await notifyCharacter(client, result.winnerId, {
            kind: 'auction',
            title: 'Bạn thắng đấu giá đất',
            body: `Bạn đã thắng phiên đấu giá "${auction.nodeName}" tại ${auction.provinceCode} với giá ${result.settledPriceMinor.toLocaleString('vi-VN')} VND.`,
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

  async ensureOpenAuction(provinceCode: string, now: Date = new Date()): Promise<void> {
    const code = (provinceCode ?? '001').trim() || '001';
    if (!provinceByCode(code)) return;

    // Settle expired auction(s) for this province first so a new one can be created.
    try {
      await this.settleExpiredForProvince(code, now);
    } catch {
      // best-effort
    }

    const existing = await this.repo.listOpenByProvince(code);
    if (existing.length > 0) return;

    const generated = generateProvinceMap(code);
    const savedPrices = await mapRepository.getProvinceLandPrices(pool, code);
    const candidates = generated.nodes.filter((n) => {
      if (n.zone === 'water' || n.zone === 'park') return false;
      const p = savedPrices.get(`${n.x}-${n.y}`) ?? 0;
      return p > 0;
    });
    if (candidates.length === 0) return;

    // Deterministic-ish rotation by time bucket + province to vary per province over time
    const bucket = Math.floor(now.getTime() / (2 * 60 * 1000)); // per 2-minute auction window
    let hash = 0;
    const seedStr = `${code}:${bucket}`;
    for (let i = 0; i < seedStr.length; i += 1) hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
    const pick = candidates[hash % candidates.length]!;
    const startingPriceMinor = savedPrices.get(`${pick.x}-${pick.y}`) ?? 0;
    if (startingPriceMinor <= 0) return;

    const endsAt = new Date(now.getTime() + 2 * 60 * 1000);

    await withTransaction(async (client) => {
      await this.repo.create(client, {
        provinceCode: code,
        nodeX: pick.x,
        nodeY: pick.y,
        zoneType: pick.zone,
        nodeName: pick.name,
        startingPriceMinor,
        endsAt,
      });
    });
  }

  async ensureOpenAuctionsForAllProvinces(now: Date = new Date()): Promise<void> {
    const provinces = await pool.query<{ code: string }>(`SELECT code FROM provinces ORDER BY code ASC`);
    for (const p of provinces.rows) {
      try {
        await this.ensureOpenAuction(p.code, now);
      } catch {
        // best-effort per province
      }
    }
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
          // GM/system land sale: escrow goes to market
          await ledger.transfer(client, {
            from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
            to: { ownerType: 'market', ownerId: SYSTEM_MARKET_ID },
            amountMinor: result.settledPriceMinor,
            kind: 'auction_settlement',
            description: `Thanh toán đấu giá đất ${auction.id}`,
            referenceType: 'province_land_auction',
            referenceId: auction.id,
          });
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
