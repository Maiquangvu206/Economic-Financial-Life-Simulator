import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { AppError } from '../../shared/http/errors.js';
import { GiftCodesService } from './gift-codes.service.js';
import type { RedeemGiftCodeRequest, UpsertGiftCodeRequest } from '@efls/contracts';

function ensureAdmin(req: Request): void {
  if (req.actorRole !== 'admin' && req.actorRole !== 'moderator') {
    throw AppError.forbidden('Admin role required');
  }
}

export class GiftCodesController {
  constructor(private readonly service: GiftCodesService = new GiftCodesService()) {}

  // user
  redeem = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as RedeemGiftCodeRequest;
    res.json(await this.service.redeem(userId, body));
  };

  listMine = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.json(await this.service.listMine(userId));
  };

  // admin
  listAll = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    res.json(await this.service.listAll());
  };

  redemptions = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const id = (req.params as any).id as string;
    res.json(await this.service.getRedemptions(id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const body = req.body as UpsertGiftCodeRequest;
    res.status(201).json(await this.service.create(body, req.actorId ?? null));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const id = (req.params as any).id as string;
    const body = req.body as UpsertGiftCodeRequest;
    res.json(await this.service.update(id, body, req.actorId ?? null));
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    ensureAdmin(req);
    const id = (req.params as any).id as string;
    await this.service.remove(id, req.actorId ?? null);
    res.json({ ok: true });
  };
}

export const giftCodesController = new GiftCodesController();
