import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { travelService } from './travel.service.js';
import type { StartRetreatTripRequest, StartShortTripRequest } from '@efls/contracts';

export class TravelController {
  getOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await travelService.getOverview(userId));
  };

  startShortTrip = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await travelService.startShortTrip(userId, req.body as StartShortTripRequest));
  };

  getLodgingOptions = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const provinceCode = String(req.query.provinceCode ?? req.query.province ?? '').trim();
    const days = Number(req.query.days ?? 1);
    const options = await travelService.getLodgingOptions(userId, provinceCode, Number.isFinite(days) ? days : 1);
    res.status(200).json({ options });
  };

  startRetreat = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await travelService.startRetreat(userId, req.body as StartRetreatTripRequest));
  };
}

export const travelController = new TravelController();
