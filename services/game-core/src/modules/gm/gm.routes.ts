import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { GmController } from './gm.controller.js';

const controller = new GmController();

export const gmRouter: Router = Router();

gmRouter.use(attachActor);

gmRouter.get('/snapshot', asyncHandler(controller.snapshot));
gmRouter.post('/adjust', asyncHandler(controller.adjust));
gmRouter.get('/directives', asyncHandler(controller.directives));
