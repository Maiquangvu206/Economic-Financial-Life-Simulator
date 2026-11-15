import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { welfareController } from './welfare.controller.js';
import { ClaimWelfareRequestSchema, UpsertWelfareBenefitRequestSchema } from '@efls/contracts';

export const welfareRouter: Router = Router();

welfareRouter.use(attachActor);
welfareRouter.get('/active', asyncHandler(welfareController.listActive));
welfareRouter.get('/available', asyncHandler(welfareController.available));
welfareRouter.post('/claim', validateBody(ClaimWelfareRequestSchema), asyncHandler(welfareController.claim));

// admin management (mounted here too for convenience; also can be mounted under /api/v1/admin)
export const welfareAdminRouter: Router = Router();
welfareAdminRouter.use(attachActor);
welfareAdminRouter.get('/', asyncHandler(welfareController.listAll));
welfareAdminRouter.post('/', validateBody(UpsertWelfareBenefitRequestSchema), asyncHandler(welfareController.upsert));
welfareAdminRouter.put('/:id', validateBody(UpsertWelfareBenefitRequestSchema), asyncHandler(welfareController.upsert));
welfareAdminRouter.delete('/:id', asyncHandler(welfareController.remove));
