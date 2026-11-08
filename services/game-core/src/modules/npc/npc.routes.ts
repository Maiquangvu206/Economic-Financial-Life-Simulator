import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { NpcController } from './npc.controller.js';
import { NpcNegotiateRequestSchema } from '@efls/contracts';

const controller = new NpcController();

export const npcRouter: Router = Router();

npcRouter.use(attachActor);

npcRouter.get('/history', asyncHandler(controller.history));

npcRouter.post(
  '/negotiate',
  validateBody(NpcNegotiateRequestSchema),
  asyncHandler(controller.negotiate),
);
