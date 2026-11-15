import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { ConstructPropertyRequestSchema } from '@efls/contracts';
import { provinceLandController } from './provinceLand.controller.js';

export const provinceLandRouter: Router = Router();

provinceLandRouter.use(attachActor);
provinceLandRouter.get('/properties', asyncHandler(provinceLandController.listByProvince));
provinceLandRouter.post('/construct', validateBody(ConstructPropertyRequestSchema), asyncHandler(provinceLandController.construct));
