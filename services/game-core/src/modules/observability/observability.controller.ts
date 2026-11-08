import type { Request, Response } from 'express';
import { ObservabilityService } from './observability.service.js';

export class ObservabilityController {
  constructor(private readonly service: ObservabilityService = new ObservabilityService()) {}

  aiMetrics = async (req: Request, res: Response): Promise<void> => {
    const metrics = await this.service.getAiMetrics(req.actorId!);
    res.status(200).json(metrics);
  };
}

export const observabilityController = new ObservabilityController();
