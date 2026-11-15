import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { RedeemGiftCodeRequestSchema, UpsertGiftCodeRequestSchema } from '@efls/contracts';
import { giftCodesController } from './gift-codes.controller.js';

// User-facing (logged-in): redeem and view used codes
export const giftCodesRouter: Router = Router();
giftCodesRouter.use(attachActor);
giftCodesRouter.post('/redeem', validateBody(RedeemGiftCodeRequestSchema), asyncHandler(giftCodesController.redeem));
giftCodesRouter.get('/my', asyncHandler(giftCodesController.listMine));

// Admin management
export const giftCodesAdminRouter: Router = Router();
giftCodesAdminRouter.use(attachActor);
giftCodesAdminRouter.get('/', asyncHandler(giftCodesController.listAll));
giftCodesAdminRouter.post('/', validateBody(UpsertGiftCodeRequestSchema), asyncHandler(giftCodesController.create));
giftCodesAdminRouter.get('/:id/redemptions', asyncHandler(giftCodesController.redemptions));
giftCodesAdminRouter.put('/:id', validateBody(UpsertGiftCodeRequestSchema), asyncHandler(giftCodesController.update));
giftCodesAdminRouter.delete('/:id', asyncHandler(giftCodesController.remove));
