import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { RecruitmentController } from './recruitment.controller.js';
import { CreateRecruitmentJobRequestSchema } from '@efls/contracts';

const controller = new RecruitmentController();

export const recruitmentRouter: Router = Router();
recruitmentRouter.use(attachActor);

recruitmentRouter.get('/jobs', asyncHandler(controller.getOverview));
recruitmentRouter.post('/jobs', validateBody(CreateRecruitmentJobRequestSchema), asyncHandler(controller.createJob));
recruitmentRouter.post('/jobs/:jobId/close', asyncHandler(controller.closeJob));
recruitmentRouter.delete('/jobs/:jobId', asyncHandler(controller.deleteJob));
recruitmentRouter.post('/jobs/:jobId/apply', asyncHandler(controller.apply));
