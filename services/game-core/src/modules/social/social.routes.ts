import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { SocialController } from './social.controller.js';
import {
  ProposeMarriageRequestSchema,
  RespondMarriageProposalRequestSchema,
  ProposeDivorceRequestSchema,
  RespondDivorceProposalRequestSchema,
  CreateWillRequestSchema,
  TrustFundDepositRequestSchema,
} from '@efls/contracts';

const controller = new SocialController();

export const socialRouter: Router = Router();

socialRouter.use(attachActor);

socialRouter.get('/overview', asyncHandler(controller.getOverview));

// Consent-based marriage
socialRouter.post('/marriage/propose', validateBody(ProposeMarriageRequestSchema), asyncHandler(controller.proposeMarriage));
socialRouter.post('/marriage/respond', validateBody(RespondMarriageProposalRequestSchema), asyncHandler(controller.respondMarriageProposal));
// Compat aliases -> propose (requires consent)
socialRouter.post('/marriage/marry', validateBody(ProposeMarriageRequestSchema), asyncHandler(controller.marry));

// Consent-based divorce
socialRouter.post('/marriage/divorce/propose', validateBody(ProposeDivorceRequestSchema), asyncHandler(controller.proposeDivorce));
socialRouter.post('/marriage/divorce/respond', validateBody(RespondDivorceProposalRequestSchema), asyncHandler(controller.respondDivorceProposal));
// Compat alias -> propose (requires consent)
socialRouter.post('/marriage/divorce', validateBody(ProposeDivorceRequestSchema), asyncHandler(controller.divorce));

socialRouter.post('/will', validateBody(CreateWillRequestSchema), asyncHandler(controller.upsertWill));
socialRouter.post('/trust-fund/deposit', validateBody(TrustFundDepositRequestSchema), asyncHandler(controller.depositTrustFund));
