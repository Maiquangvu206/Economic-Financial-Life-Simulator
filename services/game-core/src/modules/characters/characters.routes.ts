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
charactersRouter.get('/resolve-cccd/:cccd', asyncHandler(controller.resolveByCccd));
charactersRouter.get('/by-account/:accountNumber', asyncHandler(controller.lookupByAccountNumber));
charactersRouter.get('/me', asyncHandler(controller.getMe));
charactersRouter.get('/me/eligible-successors', asyncHandler(controller.eligibleSuccessors));
// UUID-constrained để tránh bắt nhầm path như /education và gây 500 do cast UUID.
const UUID_RE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
charactersRouter.get(`/:id(${UUID_RE})/eligible-successors`, asyncHandler(controller.eligibleSuccessors));
charactersRouter.get(`/:id(${UUID_RE})`, asyncHandler(controller.getById));

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
