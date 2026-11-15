import type { Request, Response } from 'express';
import { AppError } from '../../shared/http/errors.js';
import { broadcastService } from './broadcast.service.js';
import type { CreateSystemBroadcastRequest } from '@efls/contracts';

function ensureAdmin(req: Request) {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

export class BroadcastController {
  listPublic = async (_req: Request, res: Response): Promise<void> => {
    res.json(await broadcastService.listPublic(50));
  };

  listAdmin = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    res.json(await broadcastService.listAdmin(100));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const body = req.body as CreateSystemBroadcastRequest;
    res.status(201).json(await broadcastService.create(req.actorId, body));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    await broadcastService.remove(req.actorId, req.params.id as string);
    res.json({ ok: true });
  };
}

export const broadcastController = new BroadcastController();
