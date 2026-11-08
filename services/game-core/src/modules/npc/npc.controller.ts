import type { Request, Response } from 'express';
import { type NpcNegotiateRequest } from '@efls/contracts';
import { NpcService } from './npc.service.js';

export class NpcController {
  constructor(private readonly service: NpcService = new NpcService()) {}

  negotiate = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.negotiate(req.actorId!, req.body as NpcNegotiateRequest);
    res.status(200).json(result);
  };

  history = async (req: Request, res: Response): Promise<void> => {
    const history = await this.service.listHistory(req.actorId!);
    res.status(200).json(history);
  };
}

export const npcController = new NpcController();
