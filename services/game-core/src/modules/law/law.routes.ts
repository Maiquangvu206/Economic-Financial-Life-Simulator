import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { LawController } from './law.controller.js';
import { OpenCaseRequestSchema, SubmitEvidenceRequestSchema } from '@efls/contracts';

const controller = new LawController();

export const lawRouter: Router = Router();

lawRouter.use(attachActor);

lawRouter.get('/overview', asyncHandler(controller.getOverview));

lawRouter.post('/cases', validateBody(OpenCaseRequestSchema), asyncHandler(controller.openCase));

lawRouter.post(
  '/evidence',
  validateBody(SubmitEvidenceRequestSchema),
  asyncHandler(controller.submitEvidence),
);

lawRouter.post('/cases/:caseId/trial', asyncHandler(controller.trial));
