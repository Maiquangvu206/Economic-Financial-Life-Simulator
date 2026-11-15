import { Router } from 'express';
import { UpsertUniversityRequestSchema, UpsertJobRequestSchema, AdminPlayerActionRequestSchema, UpdateGameConfigRequestSchema, TriggerMacroEventRequestSchema, CreateAdminAccountRequestSchema, SetUserRoleRequestSchema, AdminTriggerSweepRequestSchema } from '@efls/contracts';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import {
  getEducationConfig,
  createUniversity,
  updateUniversity,
  deleteUniversity,
  createJob,
  updateJob,
  deleteJob,
} from './admin.education.js';
import {
  getPoliticsAdminOverview,
  createPoliticsElection,
  endPoliticsElection,
} from './admin.politics.js';
import {
  getMacroSnapshot,
  getAuditLogs,
  searchPlayers,
  adminPlayerAction,
  adminCreateAccount,
  adminSetUserRole,
  adminTriggerSweep,
  adminAiEvaluateSweeps,
  getGameConfig,
  updateGameConfig,
  triggerMacroEvent,
} from './admin.integration.js';

export const adminRouter: Router = Router();

adminRouter.get('/macro/snapshot', asyncHandler(getMacroSnapshot));
adminRouter.post('/macro/events', validateBody(TriggerMacroEventRequestSchema), asyncHandler(triggerMacroEvent));
adminRouter.get('/audit-logs', asyncHandler(getAuditLogs));
adminRouter.get('/players', asyncHandler(searchPlayers));
adminRouter.post('/players/:id/actions', validateBody(AdminPlayerActionRequestSchema), asyncHandler(adminPlayerAction));
adminRouter.post('/accounts/create', validateBody(CreateAdminAccountRequestSchema), asyncHandler(adminCreateAccount));
adminRouter.post('/accounts/role', validateBody(SetUserRoleRequestSchema), asyncHandler(adminSetUserRole));
adminRouter.post('/sweeps/trigger', validateBody(AdminTriggerSweepRequestSchema), asyncHandler(adminTriggerSweep));
adminRouter.post('/sweeps/ai-evaluate', asyncHandler(adminAiEvaluateSweeps));
adminRouter.get('/game-config', asyncHandler(getGameConfig));
adminRouter.put('/game-config', validateBody(UpdateGameConfigRequestSchema), asyncHandler(updateGameConfig));

// Education config (ngành/trường, học phí, thời gian học, mức lương sau tốt nghiệp)
adminRouter.get('/education/config', asyncHandler(getEducationConfig));
adminRouter.post('/education/universities', validateBody(UpsertUniversityRequestSchema), asyncHandler(createUniversity));
adminRouter.put('/education/universities/:id', validateBody(UpsertUniversityRequestSchema), asyncHandler(updateUniversity));
adminRouter.delete('/education/universities/:id', asyncHandler(deleteUniversity));
adminRouter.post('/education/jobs', validateBody(UpsertJobRequestSchema), asyncHandler(createJob));
adminRouter.put('/education/jobs/:id', validateBody(UpsertJobRequestSchema), asyncHandler(updateJob));
adminRouter.delete('/education/jobs/:id', asyncHandler(deleteJob));

// Politics & elections (admin)
adminRouter.get('/politics/overview', asyncHandler(getPoliticsAdminOverview));
adminRouter.post('/politics/elections', asyncHandler(createPoliticsElection));
adminRouter.post('/politics/elections/:id/end', asyncHandler(endPoliticsElection));
