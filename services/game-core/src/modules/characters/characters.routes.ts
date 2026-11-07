import { Router } from 'express';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { CharactersController } from './characters.controller.js';

const controller = new CharactersController();

export const charactersRouter: Router = Router();

charactersRouter.get('/me', asyncHandler(controller.getMe));
