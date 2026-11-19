import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { StartRetreatTripRequestSchema, StartShortTripRequestSchema } from '@efls/contracts';
import { travelController } from './travel.controller.js';

export const travelRouter: Router = Router();
travelRouter.use(attachActor);

travelRouter.get('/overview', asyncHandler(travelController.getOverview));
travelRouter.post('/short', validateBody(StartShortTripRequestSchema), asyncHandler(travelController.startShortTrip));
travelRouter.get('/lodging-options', asyncHandler(travelController.getLodgingOptions));
travelRouter.post('/retreat', validateBody(StartRetreatTripRequestSchema), asyncHandler(travelController.startRetreat));
