import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { MapController } from './map.controller.js';
import { PutMapRequestSchema } from '@efls/contracts';

const controller = new MapController();

export const mapRouter: Router = Router();

mapRouter.use(attachActor);

/** Toàn bộ bản đồ (nút, đường, phiên bản) — dùng để render bản đồ người chơi. */
mapRouter.get('/', asyncHandler(controller.getMap));

/** Lưu bản đồ (quản trị viên), xử lý xung đột phiên bản theo bản phiên bản (version). */
mapRouter.put('/', validateBody(PutMapRequestSchema), asyncHandler(controller.putMap));
