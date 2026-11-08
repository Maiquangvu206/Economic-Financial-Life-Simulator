import { Router } from 'express';
import {
  LoginRequestSchema,
  RefreshRequestSchema,
  RegisterRequestSchema,
  SsoExchangeRequestSchema,
  SsoHandoffRequestSchema,
} from '@efls/contracts';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { AuthController } from './auth.controller.js';

const controller = new AuthController();

export const authRouter: Router = Router();

authRouter.post(
  '/register',
  validateBody(RegisterRequestSchema),
  asyncHandler(controller.register),
);
authRouter.post('/login', validateBody(LoginRequestSchema), asyncHandler(controller.login));
authRouter.post('/refresh', validateBody(RefreshRequestSchema), asyncHandler(controller.refresh));
authRouter.post(
  '/sso/handoff',
  validateBody(SsoHandoffRequestSchema),
  asyncHandler(controller.handoff),
);
authRouter.post(
  '/sso/exchange',
  validateBody(SsoExchangeRequestSchema),
  asyncHandler(controller.exchange),
);
