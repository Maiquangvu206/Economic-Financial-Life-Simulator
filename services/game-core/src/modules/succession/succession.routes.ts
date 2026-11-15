import { Router } from 'express';
import { SuccessionRequestSchema } from '@efls/contracts';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { SuccessionController } from './succession.controller.js';

const controller = new SuccessionController();
export const successionRouter: Router = Router();
successionRouter.use(attachActor);

successionRouter.get('/eligible-successors', asyncHandler(controller.eligibleSuccessors));
successionRouter.post('/execute', validateBody(SuccessionRequestSchema), asyncHandler(controller.execute));
successionRouter.post('/trigger-death', asyncHandler(controller.triggerDeath));
