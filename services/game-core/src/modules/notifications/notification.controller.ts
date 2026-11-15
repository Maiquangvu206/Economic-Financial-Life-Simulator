import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { NotificationService } from './notification.service.js';

export class NotificationController {
  constructor(private readonly service = new NotificationService()) {}

  listMine = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const limit = req.query.limit != null ? Number(req.query.limit) : 50;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    res.json(await this.service.listForUser(userId, { limit, unreadOnly }));
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const ids = (req.body?.ids as string[] | undefined) ?? undefined;
    await this.service.markRead(userId, ids);
    res.json({ ok: true });
  };
}

export const notificationController = new NotificationController();
