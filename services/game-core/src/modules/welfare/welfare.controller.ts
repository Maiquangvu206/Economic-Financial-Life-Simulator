import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { AppError } from '../../shared/http/errors.js';
import { WelfareService } from './welfare.service.js';
import type { ClaimWelfareRequest, UpsertWelfareBenefitRequest } from '@efls/contracts';

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

export class WelfareController {
  constructor(private readonly service: WelfareService = new WelfareService()) {}

  listActive = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listActive());
  };

  listAll = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    res.json(await this.service.listAll());
  };

  available = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const gameYear = req.query.gameYear != null ? Number(req.query.gameYear) : undefined;
    const gameMonth = req.query.gameMonth != null ? Number(req.query.gameMonth) : undefined;
    const gameDay = req.query.gameDay != null ? Number(req.query.gameDay) : undefined;
    res.json(await this.service.getAvailableForUser(userId, gameYear, gameMonth, gameDay));
  };

  claim = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as ClaimWelfareRequest;
    res.json(await this.service.claim(userId, body));
  };

  upsert = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const body = req.body as UpsertWelfareBenefitRequest;
    const id = (req.params as any).id as string | undefined;
    res.status(id ? 200 : 201).json(await this.service.upsert(body, id));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const id = (req.params as any).id as string;
    await this.service.remove(id);
    res.json({ ok: true });
  };
}

export const welfareController = new WelfareController();
