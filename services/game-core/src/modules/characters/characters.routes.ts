import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { CreateCharacterRequestSchema, UpdateLocationRequestSchema } from '@efls/contracts';
import { CharactersController } from './characters.controller.js';

const controller = new CharactersController();

export const charactersRouter: Router = Router();

charactersRouter.use(attachActor);

charactersRouter.get('/provinces', asyncHandler(controller.listProvinces));
charactersRouter.get('/by-cccd/:cccd', asyncHandler(controller.resolveByCccd));
charactersRouter.get('/me', asyncHandler(controller.getMe));
charactersRouter.get('/:id', asyncHandler(controller.getById));

charactersRouter.post(
  '/me/profile',
  validateBody(CreateCharacterRequestSchema),
  asyncHandler(controller.createProfile),
);

charactersRouter.put(
  '/me/location',
  validateBody(UpdateLocationRequestSchema),
  asyncHandler(controller.setLocation),
);
