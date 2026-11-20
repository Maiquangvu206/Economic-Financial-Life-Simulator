import type { Request, Response } from 'express';
import { requireActorId } from '../../shared/http/actor.js';
import { FamilyService } from './family.service.js';
import type { AdoptionApplyRequest, BirthRespondRequest, AdoptionRespondRequest, ChildCareRequest, SetChildCareTierRequest, BirthProposeRequest } from '@efls/contracts';

export class FamilyController {
  constructor(private readonly service: FamilyService = new FamilyService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    res.status(200).json(await this.service.getOverview(userId));
  };

  proposeBirth = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = (req.body ?? {}) as BirthProposeRequest;
    res.status(200).json(await this.service.proposeBirth(userId, body.birthplaceCode ?? null));
  };

  respondBirth = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as BirthRespondRequest;
    res.status(200).json(await this.service.respondBirthProposal(userId, body.proposalId, body.accept));
  };

  applyAdoption = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as AdoptionApplyRequest;
    res.status(200).json(await this.service.applyAdoption(userId, body.childId, body.birthplaceCode ?? null));
  };

  respondAdoption = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as AdoptionRespondRequest;
    res.status(200).json(await this.service.respondAdoption(userId, body.applicationId, body.accept));
  };

  setCareTier = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as SetChildCareTierRequest;
    res.status(200).json(await this.service.setCareTier(userId, body.childId, body.careTier));
  };

  careAction = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as ChildCareRequest;
    res.status(200).json(await this.service.doChildAction(userId, body.childId, body.action, body.amount?.amount));
  };
}

export const familyController = new FamilyController();
