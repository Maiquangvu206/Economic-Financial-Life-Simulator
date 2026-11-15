import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { offlineController } from './offline.controller.js';

export const offlineRouter: Router = Router();

offlineRouter.use(attachActor);
offlineRouter.get('/settings', asyncHandler(offlineController.getSettings));
offlineRouter.put('/settings', asyncHandler(offlineController.updateSettings));
offlineRouter.get('/recap', asyncHandler(offlineController.getRecap));
offlineRouter.post('/process', asyncHandler(offlineController.process));

export const offlineAdminRouter: Router = Router();
offlineAdminRouter.use(attachActor);
offlineAdminRouter.get('/policy', asyncHandler(offlineController.getPolicy));
offlineAdminRouter.put('/policy', asyncHandler(offlineController.updatePolicy));
