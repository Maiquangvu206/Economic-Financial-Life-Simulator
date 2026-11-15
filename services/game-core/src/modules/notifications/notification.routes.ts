import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { MarkNotificationsReadRequestSchema } from '@efls/contracts';
import { notificationController } from './notification.controller.js';

export const notificationsRouter: Router = Router();
notificationsRouter.use(attachActor);
notificationsRouter.get('/', asyncHandler(notificationController.listMine));
notificationsRouter.post('/read', validateBody(MarkNotificationsReadRequestSchema), asyncHandler(notificationController.markRead));
