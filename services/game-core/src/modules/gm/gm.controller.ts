import type { Request, Response } from 'express';
import { GmService } from './gm.service.js';

export class GmController {
  constructor(private readonly service: GmService = new GmService()) {}

  snapshot = async (req: Request, res: Response): Promise<void> => {
    const snapshot = await this.service.getSnapshot(req.actorId!);
    res.status(200).json(snapshot);
  };

  adjust = async (req: Request, res: Response): Promise<void> => {
    const directive = await this.service.adjust(req.actorId!);
    res.status(200).json(directive);
  };

  directives = async (req: Request, res: Response): Promise<void> => {
    const directives = await this.service.listDirectives(req.actorId!);
    res.status(200).json(directives);
  };
}

export const gmController = new GmController();
