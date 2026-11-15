import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { ConstructPropertyRequestSchema, DemolishPropertyRequestSchema } from '@efls/contracts';
import { z } from 'zod';
import { provinceLandController } from './provinceLand.controller.js';

export const provinceLandRouter: Router = Router();

const MakeProvinceLandOfferSchema = z.object({
  propertyId: z.string().uuid(),
  amount: z.union([z.number().int().positive(), z.object({ amount: z.number().int().positive(), currency: z.string().optional() })]),
  message: z.string().max(500).optional(),
  provinceCode: z.string().optional(),
});

const RespondProvinceLandOfferSchema = z.object({
  offerId: z.string().uuid(),
  action: z.enum(['accept', 'reject', 'cancel']),
  provinceCode: z.string().optional(),
});

provinceLandRouter.use(attachActor);
provinceLandRouter.get('/properties', asyncHandler(provinceLandController.listByProvince));
provinceLandRouter.post('/construct', validateBody(ConstructPropertyRequestSchema), asyncHandler(provinceLandController.construct));
provinceLandRouter.post('/demolish', validateBody(DemolishPropertyRequestSchema), asyncHandler(provinceLandController.demolish));
provinceLandRouter.post('/offers', validateBody(MakeProvinceLandOfferSchema), asyncHandler(provinceLandController.makeOffer));
provinceLandRouter.post('/offers/respond', validateBody(RespondProvinceLandOfferSchema), asyncHandler(provinceLandController.respondOffer));
