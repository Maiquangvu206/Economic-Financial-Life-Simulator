import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { healthService } from './health.service.js';
import type { ClaimWelfareSupportRequest, PerformEntertainmentRequest, UpdateHealthInsuranceRequest } from '@efls/contracts';

export class HealthController {
  getOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await healthService.getOverview(userId));
  };

  updateInsurance = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await healthService.updateInsurance(userId, req.body as UpdateHealthInsuranceRequest));
  };

  homeRest = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await healthService.performHomeRest(userId));
  };

  medicalVisit = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await healthService.performMedicalVisit(userId));
  };

  claimSupport = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await healthService.claimSupport(userId, req.body as ClaimWelfareSupportRequest));
  };

  entertainment = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await healthService.performEntertainment(userId, req.body as PerformEntertainmentRequest));
  };
}

export const healthController = new HealthController();
