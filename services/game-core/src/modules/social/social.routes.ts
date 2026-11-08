import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { SocialController } from './social.controller.js';
import {
  MarryRequestSchema,
  DivorceRequestSchema,
  CreateWillRequestSchema,
  TrustFundDepositRequestSchema,
} from '@efls/contracts';

const controller = new SocialController();

export const socialRouter: Router = Router();

socialRouter.use(attachActor);

socialRouter.get('/overview', asyncHandler(controller.getOverview));

socialRouter.post(
  '/marriage/marry',
  validateBody(MarryRequestSchema),
  asyncHandler(controller.marry),
);

socialRouter.post(
  '/marriage/divorce',
  validateBody(DivorceRequestSchema),
  asyncHandler(controller.divorce),
);

socialRouter.post(
  '/will',
  validateBody(CreateWillRequestSchema),
  asyncHandler(controller.upsertWill),
);

socialRouter.post(
  '/trust-fund/deposit',
  validateBody(TrustFundDepositRequestSchema),
  asyncHandler(controller.depositTrustFund),
);
