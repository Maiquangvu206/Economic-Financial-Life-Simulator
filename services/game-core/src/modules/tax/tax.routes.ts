import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { TaxController } from './tax.controller.js';
import {
  AssessRequestSchema,
  PayTaxRequestSchema,
  ReportRequestSchema,
  RevokeLicenseRequestSchema,
  StartAuditRequestSchema,
} from '@efls/contracts';

const controller = new TaxController();

export const taxRouter: Router = Router();

taxRouter.use(attachActor);

taxRouter.get('/overview', asyncHandler(controller.getOverview));

taxRouter.post('/assess', validateBody(AssessRequestSchema), asyncHandler(controller.assess));

taxRouter.post('/pay', validateBody(PayTaxRequestSchema), asyncHandler(controller.pay));

taxRouter.post(
  '/audit/start',
  validateBody(StartAuditRequestSchema),
  asyncHandler(controller.startAudit),
);

taxRouter.post('/report', validateBody(ReportRequestSchema), asyncHandler(controller.report));

taxRouter.post(
  '/licenses/revoke',
  validateBody(RevokeLicenseRequestSchema),
  asyncHandler(controller.revokeLicense),
);
