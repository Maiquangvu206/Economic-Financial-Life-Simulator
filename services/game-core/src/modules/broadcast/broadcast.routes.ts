import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { CreateSystemBroadcastRequestSchema } from '@efls/contracts';
import { broadcastController } from './broadcast.controller.js';

export const broadcastRouter: Router = Router();
broadcastRouter.use(attachActor);
// public for logged-in users (portal)
broadcastRouter.get('/active', asyncHandler(broadcastController.listPublic));

export const broadcastAdminRouter: Router = Router();
broadcastAdminRouter.use(attachActor);
broadcastAdminRouter.get('/', asyncHandler(broadcastController.listAdmin));
broadcastAdminRouter.post('/', validateBody(CreateSystemBroadcastRequestSchema), asyncHandler(broadcastController.create));
broadcastAdminRouter.delete('/:id', asyncHandler(broadcastController.remove));
