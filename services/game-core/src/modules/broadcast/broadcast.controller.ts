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
  /** In-app (người dùng đã đăng nhập) */
  listPublic = async (_req: Request, res: Response): Promise<void> => {
    res.json(await broadcastService.listPublic(50));
  };

  /** Trang đăng nhập/trang chủ (không cần đăng nhập) */
  listForLogin = async (_req: Request, res: Response): Promise<void> => {
    res.json(await broadcastService.listForLogin(30));
  };

  listAdmin = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    res.json(await broadcastService.listAdmin(100));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const body = req.body as CreateSystemBroadcastRequest;
    if (body.showOnLogin !== true && body.showInApp !== false) {
      throw AppError.badRequest('Vui lòng chọn ít nhất một vị trí hiển thị (trang đăng nhập hoặc trang người dùng).');
    }
    res.status(201).json(await broadcastService.create(req.actorId, body));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    await broadcastService.remove(req.actorId, req.params.id as string);
    res.json({ ok: true });
  };
}

export const broadcastController = new BroadcastController();
