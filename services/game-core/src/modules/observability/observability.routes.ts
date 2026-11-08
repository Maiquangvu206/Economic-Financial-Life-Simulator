import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { ObservabilityController } from './observability.controller.js';

const controller = new ObservabilityController();

export const observabilityRouter: Router = Router();

observabilityRouter.use(attachActor);

observabilityRouter.get('/ai', asyncHandler(controller.aiMetrics));
