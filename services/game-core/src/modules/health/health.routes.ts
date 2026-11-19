import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import {
  ClaimWelfareSupportRequestSchema,
  PerformEntertainmentRequestSchema,
  UpdateHealthInsuranceRequestSchema,
} from '@efls/contracts';
import { healthController } from './health.controller.js';

export const healthRouter: Router = Router();
healthRouter.use(attachActor);

healthRouter.get('/overview', asyncHandler(healthController.getOverview));
healthRouter.post('/insurance', validateBody(UpdateHealthInsuranceRequestSchema), asyncHandler(healthController.updateInsurance));
healthRouter.post('/rest', asyncHandler(healthController.homeRest));
healthRouter.post('/medical/visit', asyncHandler(healthController.medicalVisit));
healthRouter.post('/supports/claim', validateBody(ClaimWelfareSupportRequestSchema), asyncHandler(healthController.claimSupport));
healthRouter.post('/entertainment/perform', validateBody(PerformEntertainmentRequestSchema), asyncHandler(healthController.entertainment));
