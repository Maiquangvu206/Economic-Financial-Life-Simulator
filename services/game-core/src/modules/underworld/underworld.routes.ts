import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { UnderworldController } from './underworld.controller.js';
import {
  BuyCredentialRequestSchema,
  BuyProtectionRequestSchema,
  CollectEvidenceRequestSchema,
  CommitCrimeRequestSchema,
  SellEvidenceRequestSchema,
  StartBlackmailRequestSchema,
  StartStingRequestSchema,
  SubmitEvidenceUnderworldRequestSchema,
} from '@efls/contracts';

const controller = new UnderworldController();

export const underworldRouter: Router = Router();

underworldRouter.use(attachActor);

underworldRouter.get('/overview', asyncHandler(controller.getOverview));

underworldRouter.post(
  '/crime',
  validateBody(CommitCrimeRequestSchema),
  asyncHandler(controller.commitCrime),
);

underworldRouter.post(
  '/credentials/buy',
  validateBody(BuyCredentialRequestSchema),
  asyncHandler(controller.buyCredential),
);

underworldRouter.post(
  '/evidence/collect',
  validateBody(CollectEvidenceRequestSchema),
  asyncHandler(controller.collectEvidence),
);

underworldRouter.post(
  '/evidence/sell',
  validateBody(SellEvidenceRequestSchema),
  asyncHandler(controller.sellEvidence),
);

underworldRouter.post(
  '/evidence/submit',
  validateBody(SubmitEvidenceUnderworldRequestSchema),
  asyncHandler(controller.submitEvidence),
);

underworldRouter.post(
  '/blackmail/start',
  validateBody(StartBlackmailRequestSchema),
  asyncHandler(controller.startBlackmail),
);

underworldRouter.post('/blackmail/:id/collect', asyncHandler(controller.collectBlackmail));

underworldRouter.post(
  '/sting',
  validateBody(StartStingRequestSchema),
  asyncHandler(controller.startSting),
);

underworldRouter.post(
  '/protection/buy',
  validateBody(BuyProtectionRequestSchema),
  asyncHandler(controller.buyProtection),
);

underworldRouter.post('/sweep/trigger', asyncHandler(controller.triggerSweep));
