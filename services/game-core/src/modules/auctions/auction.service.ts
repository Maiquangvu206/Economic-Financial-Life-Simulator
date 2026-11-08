import { AppError } from '../../shared/http/errors.js';
import { toMinor, withTransaction } from '../../shared/db/tx.js';
import { requireCharacterByUserId } from '../../shared/actors/character.js';
import { ledger, SYSTEM_ESCROW_ID } from '../../shared/ledger/ledger.service.js';
import { notify } from '../notifications/notification.service.js';
import { type AuctionDto, type AuctionOverviewDto, MoneySchema } from '@efls/contracts';
import { auctionRepository } from './auction.repository.js';

function money(amount: number) {
  return MoneySchema.parse({ amount, currency: 'VND' });
}

function toAuctionDto(
  row: Awaited<ReturnType<typeof auctionRepository.listOpenAuctions>>[number],
  viewerCharacterId: string,
): AuctionDto {
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    sellerCharacterId: row.sellerCharacterId,
    sellerName: row.sellerName,
    startingPrice: money(Number(row.startingPriceMinor)),
    currentBid: money(Number(row.currentBidMinor)),
    highestBidderId: row.highestBidderId,
    highestBidderName: row.highestBidderName,
    endsAt: row.endsAt.toISOString(),
    status: row.status as AuctionDto['status'],
    createdAt: row.createdAt.toISOString(),
    isMine: row.sellerCharacterId === viewerCharacterId,
    isHighestBidder: row.highestBidderId === viewerCharacterId,
  };
}

/** Dịch vụ đấu giá tài sản phát mại. */
export class AuctionService {
  constructor(private readonly repository = auctionRepository) {}

  async getOverview(userId: string): Promise<AuctionOverviewDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const auctions = await this.repository.listOpenAuctions();

    return {
      auctions: auctions.map((a) => toAuctionDto(a, character.id)),
      openCount: auctions.length,
    };
  }

  async getAuction(userId: string, auctionId: string): Promise<AuctionDto> {
    const db = this.repository.db;
    const character = await requireCharacterByUserId(db, userId);
    const auction = await this.repository.getAuction(auctionId);
    if (!auction) throw AppError.notFound('Auction');
    return toAuctionDto(auction, character.id);
  }

  /** Đặt giá vào phiên đấu giá. Tiền được giữ trong escrow cho đến khi phiên kết thúc. */
  async placeBid(userId: string, auctionId: string, amountMinor: number): Promise<AuctionDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const auction = await this.repository.getAuction(auctionId);
      if (!auction) throw AppError.notFound('Auction');
      if (auction.status !== 'open') {
        throw AppError.badRequest('Phiên đấu giá này đã kết thúc.');
      }
      const now = new Date();
      if (now >= auction.endsAt) {
        throw AppError.badRequest('Phiên đấu giá đã hết hạn.');
      }
      if (amountMinor <= Number(auction.currentBidMinor)) {
        throw AppError.badRequest(
          `Giá đặt phải cao hơn giá hiện tại (${formatMinor(Number(auction.currentBidMinor))} VND).`,
        );
      }

      const cash = toMinor(character.cash_minor);
      if (cash < amountMinor) {
        throw AppError.conflict('insufficient_funds', 'Không đủ tiền mặt để đặt giá.');
      }

      // Trả lại escrow cho người giữ giá cao nhất trước đó (nếu có).
      if (auction.highestBidderId) {
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: auction.highestBidderId },
          amountMinor: Number(auction.currentBidMinor),
          kind: 'auction_bid_refund',
          description: `Hoàn tiền đấu giá không thắng ${auctionId}`,
          referenceType: 'auction',
          referenceId: auctionId,
        });
      }

      // Gửi tiền đặt giá vào escrow.
      await ledger.transfer(client, {
        from: { ownerType: 'character', ownerId: character.id },
        to: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
        amountMinor,
        kind: 'auction_bid',
        description: `Đặt giá đấu giá ${auctionId}`,
        referenceType: 'auction',
        referenceId: auctionId,
      });

      await this.repository.placeBid(client, {
        auctionId,
        bidderCharacterId: character.id,
        amountMinor,
      });

      await notify(client, {
        userId,
        kind: 'auction',
        title: 'Đã đặt giá đấu',
        body: `Bạn vừa đặt giá ${formatMinor(amountMinor)} VND cho "${auction.propertyName}".`,
        payload: { auctionId, propertyId: auction.propertyId, amountMinor },
      });

      const dto = await this.repository.getAuction(auctionId);
      if (!dto) throw new Error('Auction disappeared during bid');
      return toAuctionDto(dto, character.id);
    });
  }
  async endAuction(userId: string, auctionId: string): Promise<AuctionDto> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const auction = await this.repository.getAuction(auctionId);
      if (!auction) throw AppError.notFound('Auction');
      if (auction.status !== 'open') {
        throw AppError.badRequest('Phiên đấu giá không ở trạng thái mở.');
      }

      const winner = await this.repository.endAuction(client, auctionId);

      if (winner.winnerId && Number(auction.currentBidMinor) > 0) {
        // Chuyển tiền từ escrow đến người bán.
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: auction.sellerCharacterId },
          amountMinor: Number(auction.currentBidMinor),
          kind: 'auction_settlement',
          description: `Thanh toán đấu giá ${auctionId}`,
          referenceType: 'auction',
          referenceId: auctionId,
        });

        // Chuyển chủ sở hữu propriétés cho người thắng.
        await client.query(
          `UPDATE properties
           SET owner_character_id = $2, owner_company_id = NULL,
               status = 'owned', updated_at = now()
           WHERE id = $1 AND status IN ('listed', 'owned')`,
          [auction.propertyId, winner.winnerId],
        );

        await notify(client, {
          userId: winner.winnerId,
          kind: 'auction',
          title: 'Bạn thắng đấu giá',
          body: `Bạn đã sở hữu "${auction.propertyName}" với giá ${formatMinor(Number(auction.currentBidMinor))} VND.`,
          payload: {
            auctionId,
            propertyId: auction.propertyId,
            priceMinor: Number(auction.currentBidMinor),
          },
        });
        await notify(client, {
          userId: auction.sellerCharacterId,
          kind: 'auction',
          title: 'Đấu giá đã kết thúc',
          body: `Tài sản "${auction.propertyName}" đã được bán với giá ${formatMinor(Number(auction.currentBidMinor))} VND.`,
          payload: {
            auctionId,
            propertyId: auction.propertyId,
            priceMinor: Number(auction.currentBidMinor),
          },
        });
      } else {
        // Không có ai đấu giá: hoàn toàn escrow (trống) và hủy.
        await notify(client, {
          userId: auction.sellerCharacterId,
          kind: 'auction',
          title: 'Đấu giá không có người tham gia',
          body: `Tài sản "${auction.propertyName}" không có người đấu giá và được hoàn trả.`,
          payload: { auctionId, propertyId: auction.propertyId },
        });
      }

      const dto = await this.repository.getAuction(auctionId);
      if (!dto) throw new Error('Auction disappeared after end');
      return toAuctionDto(dto, character.id);
    });
  }

  /** Hủy phiên đấu giá và hoàn trả toàn bộ tiền escrow (chỉ admin). */
  async cancelAuction(userId: string, auctionId: string): Promise<void> {
    return withTransaction(async (client) => {
      void requireCharacterByUserId(client, userId);
      const auction = await this.repository.getAuction(auctionId);
      if (!auction) throw AppError.notFound('Auction');
      if (auction.status !== 'open') {
        throw AppError.badRequest('Không thể hủy phiên đã kết thúc.');
      }

      await this.repository.cancelAuction(client, auctionId);

      if (auction.highestBidderId && Number(auction.currentBidMinor) > 0) {
        await ledger.transfer(client, {
          from: { ownerType: 'escrow', ownerId: SYSTEM_ESCROW_ID },
          to: { ownerType: 'character', ownerId: auction.highestBidderId },
          amountMinor: Number(auction.currentBidMinor),
          kind: 'auction_cancel_refund',
          description: `Hoàn tiền khi hủy đấu giá ${auctionId}`,
          referenceType: 'auction',
          referenceId: auctionId,
        });
      }

      await notify(client, {
        userId: auction.sellerCharacterId,
        kind: 'auction',
        title: 'Đấu giá bị hủy',
        body: `Phiên đấu giá "${auction.propertyName}" đã bị hủy.`,
        payload: { auctionId, propertyId: auction.propertyId },
      });
    });
  }

  /** Tạo phiên đấu giá mới cho một bất động sản (chủ sở hữu hoặc admin). */
  async createAuction(
    userId: string,
    propertyId: string,
    startingPriceMinor: number,
    endsAt: Date,
  ): Promise<void> {
    return withTransaction(async (client) => {
      const character = await requireCharacterByUserId(client, userId);
      const property = await this.repository.getPropertyById(client, propertyId);
      if (!property) throw AppError.notFound('Property');
      if (property.ownerCharacterId !== character.id) {
        throw AppError.forbidden('Chỉ chủ sở hữu mới được đấu giá tài sản.');
      }
      if (property.status !== 'owned' && property.status !== 'listed') {
        throw AppError.badRequest('Chỉ có thể đấu giá bất động sản đang sở hữu hoặc đang bán.');
      }
      const now = new Date();
      if (endsAt <= now) {
        throw AppError.badRequest('Thời gian kết thúc phải ở trong tương lai.');
      }

      await this.repository.createAuction(client, {
        propertyId,
        sellerCharacterId: character.id,
        startingPriceMinor,
        endsAt,
      });

      await notify(client, {
        userId,
        kind: 'auction',
        title: 'Tạo phiên đấu giá',
        body: `Bạn đã đưa "${property.name}" lên đấu giá với giá khởi điểm ${formatMinor(startingPriceMinor)} VND.`,
        payload: { propertyId, startingPriceMinor, endsAt: endsAt.toISOString() },
      });
    });
  }
}

function formatMinor(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(amount);
}

export const auctionService = new AuctionService();
