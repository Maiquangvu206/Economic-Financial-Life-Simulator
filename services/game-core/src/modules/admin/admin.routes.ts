import { Router } from 'express';
import { z } from 'zod';
import { UpsertUniversityRequestSchema, UpsertJobRequestSchema, AdminPlayerActionRequestSchema, UpdateGameConfigRequestSchema, TriggerMacroEventRequestSchema, CreateAdminAccountRequestSchema, SetUserRoleRequestSchema, AdminTriggerSweepRequestSchema, RevokeMayorRequestSchema, UpdateMayorConfigRequestSchema, UpdateInterestRateConfigRequestSchema, AdjustStateFundRequestSchema, SupportCompaniesFromStateFundRequestSchema, UpsertIndustryRevenueConfigsRequestSchema, AdminStockAdjustRequestSchema } from '@efls/contracts';
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
  revokeMayor,
  updateMayorConfig,
  expireMayorTerms,
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
  getInterestRateConfig,
  updateInterestRateConfig,
  getStateFundSnapshot,
  adminAdjustStateFund,
  adminSupportCompaniesFromStateFund,
  getIndustryRevenueConfigs,
  upsertIndustryRevenueConfigs,
  adminAdjustStockPrice,
  getAdminMarketLogs,
  getAiConfigAdmin,
  updateAiConfigAdmin,
  getAiStatusProxy,
} from './admin.integration.js';

export const adminRouter: Router = Router();

adminRouter.get('/macro/snapshot', asyncHandler(getMacroSnapshot));
adminRouter.get('/state-fund', asyncHandler(getStateFundSnapshot));
adminRouter.post('/state-fund/adjust', validateBody(AdjustStateFundRequestSchema), asyncHandler(adminAdjustStateFund));
adminRouter.post('/state-fund/support-companies', validateBody(SupportCompaniesFromStateFundRequestSchema), asyncHandler(adminSupportCompaniesFromStateFund));
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
adminRouter.get('/interest-rates', asyncHandler(getInterestRateConfig));
adminRouter.put('/interest-rates', validateBody(UpdateInterestRateConfigRequestSchema), asyncHandler(updateInterestRateConfig));

// Education config (ngành/trường, học phí, thời gian học, mức lương sau tốt nghiệp)
adminRouter.get('/education/config', asyncHandler(getEducationConfig));
adminRouter.post('/education/universities', validateBody(UpsertUniversityRequestSchema), asyncHandler(createUniversity));
adminRouter.put('/education/universities/:id', validateBody(UpsertUniversityRequestSchema), asyncHandler(updateUniversity));
adminRouter.delete('/education/universities/:id', asyncHandler(deleteUniversity));
adminRouter.post('/education/jobs', validateBody(UpsertJobRequestSchema), asyncHandler(createJob));
adminRouter.put('/education/jobs/:id', validateBody(UpsertJobRequestSchema), asyncHandler(updateJob));
adminRouter.delete('/education/jobs/:id', asyncHandler(deleteJob));

// Politics & elections (admin) - 3 pha Thị trưởng + thu hồi tư cách
adminRouter.get('/politics/overview', asyncHandler(getPoliticsAdminOverview));
adminRouter.post('/politics/elections', asyncHandler(createPoliticsElection));
adminRouter.post('/politics/elections/:id/end', asyncHandler(endPoliticsElection));
adminRouter.put('/politics/mayor/config', validateBody(UpdateMayorConfigRequestSchema), asyncHandler(updateMayorConfig));
adminRouter.post('/politics/mayor/revoke', validateBody(RevokeMayorRequestSchema), asyncHandler(revokeMayor));
adminRouter.post('/politics/mayor/expire', asyncHandler(expireMayorTerms));

// Industry revenue configs (30-day auto company revenue)
adminRouter.get('/industry-revenue-configs', asyncHandler(getIndustryRevenueConfigs));
adminRouter.put('/industry-revenue-configs', validateBody(UpsertIndustryRevenueConfigsRequestSchema), asyncHandler(upsertIndustryRevenueConfigs));

// Stock market admin controls
adminRouter.post('/stock-market/adjust-price', validateBody(AdminStockAdjustRequestSchema), asyncHandler(adminAdjustStockPrice));
adminRouter.get('/stock-market/logs', asyncHandler(getAdminMarketLogs));

// AI providers (config + monitoring)
const UpdateAiConfigBodySchema = z.object({
  config: z.object({
    provider: z.string().optional(),
    failoverChain: z.string().optional(),
    cooldownSec: z.number().optional(),
    timeoutMs: z.number().optional(),
    openaiBaseUrl: z.string().optional(),
    openaiModel: z.string().optional(),
    openaiApiKey: z.string().optional(),
    openaiEndpoints: z.array(z.object({ baseUrl: z.string().optional(), apiKey: z.string().optional(), model: z.string().optional() })).optional(),
    geminiModel: z.string().optional(),
    geminiApiKey: z.string().optional(),
    geminiApiKeys: z.array(z.string()).optional(),
    note: z.string().optional(),
  }).optional(),
}).passthrough();
adminRouter.get('/ai/config', asyncHandler(getAiConfigAdmin));
adminRouter.put('/ai/config', validateBody(UpdateAiConfigBodySchema), asyncHandler(updateAiConfigAdmin));
adminRouter.get('/ai/status', asyncHandler(getAiStatusProxy));
