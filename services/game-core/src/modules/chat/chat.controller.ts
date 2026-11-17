import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { ChatService } from './chat.service.js';

export class ChatController {
  constructor(private readonly service = new ChatService()) {}

  searchUsers = async (req: Request, res: Response): Promise<void> => {
    requireActorId(req);
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(await this.service.searchUsers(q));
  };

  conversations = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.json(await this.service.listConversations(userId));
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const peerUserId = String((req.body as any)?.peerUserId || '');
    if (!peerUserId) { res.status(400).json({ error: 'peerUserId required' }); return; }
    res.json(await this.service.markRead(userId, peerUserId));
  };
}
