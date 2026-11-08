import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { AuctionController } from './auction.controller.js';
import {
  CancelAuctionRequestSchema,
  CreateAuctionRequestSchema,
  PlaceBidRequestSchema,
} from '@efls/contracts';

const controller = new AuctionController();

export const auctionRouter: Router = Router();

auctionRouter.use(attachActor);

/** Danh sách phiên đấu giá đang mở (mọi người chơi). */
auctionRouter.get('/', asyncHandler(controller.getOverview));

/** Chi tiết một phiên đấu giá. */
auctionRouter.get('/:auctionId', asyncHandler(controller.getAuction));

/** Đặt giá vào phiên đấu giá. */
auctionRouter.post(
  '/:auctionId/bid',
  validateBody(PlaceBidRequestSchema),
  asyncHandler(controller.placeBid),
);

/** Kết thúc phiên đấu giá (chỉ admin / nhân viên được phép). */
auctionRouter.post('/:auctionId/end', asyncHandler(controller.endAuction));

/** Hủy phiên đấu giá (chỉ admin). */
auctionRouter.post(
  '/cancel',
  validateBody(CancelAuctionRequestSchema),
  asyncHandler(controller.cancelAuction),
);

/** Tạo phiên đấu giá mới (chỉ admin). */
auctionRouter.post(
  '/',
  validateBody(CreateAuctionRequestSchema),
  asyncHandler(controller.createAuction),
);
