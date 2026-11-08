import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { PoliticsController } from './politics.controller.js';
import {
  CreateElectionRequestSchema,
  DeclareCandidacyRequestSchema,
  DonateRequestSchema,
  VoteRequestSchema,
} from '@efls/contracts';

const controller = new PoliticsController();

export const politicsRouter: Router = Router();

politicsRouter.use(attachActor);

politicsRouter.get('/overview', asyncHandler(controller.getOverview));

politicsRouter.post(
  '/elections',
  validateBody(CreateElectionRequestSchema),
  asyncHandler(controller.createElection),
);

politicsRouter.post(
  '/candidacy',
  validateBody(DeclareCandidacyRequestSchema),
  asyncHandler(controller.declareCandidacy),
);

politicsRouter.post('/vote', validateBody(VoteRequestSchema), asyncHandler(controller.vote));

politicsRouter.post('/donate', validateBody(DonateRequestSchema), asyncHandler(controller.donate));

politicsRouter.post('/elections/:electionId/end', asyncHandler(controller.endElection));
