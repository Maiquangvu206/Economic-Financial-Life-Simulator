import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { EducationController } from './education.controller.js';
import {
  EnrollUniversityRequestSchema,
  GraduateRequestSchema,
  EarlyGraduateRequestSchema,
  EarlyGraduateSubmitRequestSchema,
} from '@efls/contracts';

const controller = new EducationController();

export const educationRouter: Router = Router();

educationRouter.use(attachActor);

educationRouter.get('/overview', asyncHandler(controller.getOverview));

educationRouter.post(
  '/enroll',
  validateBody(EnrollUniversityRequestSchema),
  asyncHandler(controller.enroll),
);

educationRouter.post(
  '/graduate',
  validateBody(GraduateRequestSchema),
  asyncHandler(controller.graduate),
);

educationRouter.post(
  '/early-graduate/start',
  validateBody(EarlyGraduateRequestSchema),
  asyncHandler(controller.earlyGraduateStart),
);

educationRouter.post(
  '/early-graduate/submit',
  validateBody(EarlyGraduateSubmitRequestSchema),
  asyncHandler(controller.earlyGraduateSubmit),
);
