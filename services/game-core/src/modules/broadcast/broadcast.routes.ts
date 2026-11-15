import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { CreateSystemBroadcastRequestSchema } from '@efls/contracts';
import { broadcastController } from './broadcast.controller.js';

export const broadcastRouter: Router = Router();
// Hiển thị trên trang đăng nhập/trang chủ (không cần actor người dùng, vẫn qua internal token/gateway)
broadcastRouter.get('/login', asyncHandler(broadcastController.listForLogin));
// Hiển thị trong ứng dụng/trang người dùng (cần actor)
broadcastRouter.get('/active', attachActor, asyncHandler(broadcastController.listPublic));

export const broadcastAdminRouter: Router = Router();
broadcastAdminRouter.use(attachActor);
broadcastAdminRouter.get('/', asyncHandler(broadcastController.listAdmin));
broadcastAdminRouter.post('/', validateBody(CreateSystemBroadcastRequestSchema), asyncHandler(broadcastController.create));
broadcastAdminRouter.delete('/:id', asyncHandler(broadcastController.remove));
