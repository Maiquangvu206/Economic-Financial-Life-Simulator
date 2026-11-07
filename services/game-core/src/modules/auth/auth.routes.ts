import { Router } from 'express';
import { LoginRequestSchema, RefreshRequestSchema, RegisterRequestSchema } from '@efls/contracts';
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
