import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { SuccessionController } from './succession.controller.js';

const controller = new SuccessionController();
export const successionRouter: Router = Router();
successionRouter.use(attachActor);

successionRouter.get('/eligible-successors', asyncHandler(controller.eligibleSuccessors));
successionRouter.post('/execute', asyncHandler(controller.execute));
successionRouter.post('/trigger-death', asyncHandler(controller.triggerDeath));
