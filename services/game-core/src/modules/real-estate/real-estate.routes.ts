import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { RealEstateController } from './real-estate.controller.js';
import {
  BuyLandRequestSchema,
  BuyPropertyRequestSchema,
  ConstructPropertyRequestSchema,
  DemolishPropertyRequestSchema,
  ListPropertyRequestSchema,
  MakePropertyOfferRequestSchema,
  RentPropertyRequestSchema,
  RespondPropertyOfferRequestSchema,
  TerminateLeaseRequestSchema,
  UnlistPropertyRequestSchema,
  UpdateRentTermsRequestSchema,
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
  '/buy-land',
  validateBody(BuyLandRequestSchema),
  asyncHandler(controller.buyLand),
);

realEstateRouter.post(
  '/list',
  validateBody(ListPropertyRequestSchema),
  asyncHandler(controller.listProperty),
);

realEstateRouter.post(
  '/unlist',
  validateBody(UnlistPropertyRequestSchema),
  asyncHandler(controller.unlistProperty),
);

realEstateRouter.post(
  '/rent-terms',
  validateBody(UpdateRentTermsRequestSchema),
  asyncHandler(controller.updateRentTerms),
);

realEstateRouter.post(
  '/rent',
  validateBody(RentPropertyRequestSchema),
  asyncHandler(controller.rentProperty),
);

realEstateRouter.post(
  '/lease/terminate',
  validateBody(TerminateLeaseRequestSchema),
  asyncHandler(controller.terminateLease),
);

realEstateRouter.post(
  '/offers',
  validateBody(MakePropertyOfferRequestSchema),
  asyncHandler(controller.makeOffer),
);

realEstateRouter.post(
  '/offers/respond',
  validateBody(RespondPropertyOfferRequestSchema),
  asyncHandler(controller.respondOffer),
);

realEstateRouter.post(
  '/construct',
  validateBody(ConstructPropertyRequestSchema),
  asyncHandler(controller.constructProperty),
);

realEstateRouter.post(
  '/demolish',
  validateBody(DemolishPropertyRequestSchema),
  asyncHandler(controller.demolishProperty),
);
