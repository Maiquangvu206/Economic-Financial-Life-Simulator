import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import {
  BirthProposeRequestSchema,
  BirthRespondRequestSchema,
  AdoptionApplyRequestSchema,
  AdoptionRespondRequestSchema,
  ChildCareRequestSchema,
  SetChildCareTierRequestSchema,
} from '@efls/contracts';
import { FamilyController } from './family.controller.js';

const controller = new FamilyController();

export const familyRouter: Router = Router();
familyRouter.use(attachActor);

familyRouter.get('/overview', asyncHandler(controller.getOverview));
familyRouter.post('/birth/propose', validateBody(BirthProposeRequestSchema), asyncHandler(controller.proposeBirth));
familyRouter.post('/birth/respond', validateBody(BirthRespondRequestSchema), asyncHandler(controller.respondBirth));
familyRouter.post('/adoption/apply', validateBody(AdoptionApplyRequestSchema), asyncHandler(controller.applyAdoption));
familyRouter.post('/adoption/respond', validateBody(AdoptionRespondRequestSchema), asyncHandler(controller.respondAdoption));
familyRouter.post('/children/care-tier', validateBody(SetChildCareTierRequestSchema), asyncHandler(controller.setCareTier));
familyRouter.post('/children/care', validateBody(ChildCareRequestSchema), asyncHandler(controller.careAction));
