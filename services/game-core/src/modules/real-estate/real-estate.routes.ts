import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { RealEstateController } from './real-estate.controller.js';
import {
  BuyPropertyRequestSchema,
  ListPropertyRequestSchema,
  RentPropertyRequestSchema,
} from '@efls/contracts';

const controller = new RealEstateController();

export const realEstateRouter: Router = Router();

realEstateRouter.use(attachActor);

realEstateRouter.get('/overview', asyncHandler(controller.getOverview));

realEstateRouter.post(
  '/buy',
  validateBody(BuyPropertyRequestSchema),
  asyncHandler(controller.buyProperty),
);

realEstateRouter.post(
  '/list',
  validateBody(ListPropertyRequestSchema),
  asyncHandler(controller.listProperty),
);

realEstateRouter.post(
  '/rent',
  validateBody(RentPropertyRequestSchema),
  asyncHandler(controller.rentProperty),
);
