import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { recruitmentController } from '../recruitment/recruitment.controller.js';

export const jobsRouter: Router = Router();
jobsRouter.use(attachActor);

jobsRouter.post('/resign', asyncHandler(recruitmentController.resignCurrentEmployment));
