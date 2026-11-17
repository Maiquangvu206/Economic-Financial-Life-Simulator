import { Router } from 'express';
import { attachActor } from '../../shared/http/actor.js';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { ChatController } from './chat.controller.js';

const controller = new ChatController();

export const chatRouter: Router = Router();

chatRouter.use(attachActor);
chatRouter.get('/search-users', asyncHandler(controller.searchUsers));
chatRouter.get('/conversations', asyncHandler(controller.conversations));
chatRouter.post('/conversations/read', asyncHandler(controller.markRead));
