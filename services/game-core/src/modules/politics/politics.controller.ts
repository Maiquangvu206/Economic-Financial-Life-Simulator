import type { Request, Response } from 'express';
import {
  type CreateElectionRequest,
  type DeclareCandidacyRequest,
  type DonateRequest,
  type VoteRequest,
  type MayorPolicyActionRequest,
} from '@efls/contracts';
import { PoliticsService } from './politics.service.js';

export class PoliticsController {
  constructor(private readonly service: PoliticsService = new PoliticsService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  getMayorState = async (req: Request, res: Response): Promise<void> => {
    const state = await this.service.getMayorState(req.actorId!);
    res.status(200).json(state);
  };

  createElection = async (req: Request, res: Response): Promise<void> => {
    const { endsAt, termDays } = (req.body ?? {}) as CreateElectionRequest & { termDays?: number };
    const election = await this.service.createElection(
      req.actorId!,
      endsAt ? new Date(endsAt) : undefined,
      termDays,
    );
    res.status(200).json(election);
  };

  declareCandidacy = async (req: Request, res: Response): Promise<void> => {
    const { electionId, name } = req.body as DeclareCandidacyRequest;
    const candidate = await this.service.declareCandidacy(req.actorId!, electionId, name);
    res.status(200).json(candidate);
  };

  vote = async (req: Request, res: Response): Promise<void> => {
    const { electionId, candidateId } = req.body as VoteRequest;
    const overview = await this.service.vote(req.actorId!, electionId, candidateId);
    res.status(200).json(overview);
  };

  donate = async (req: Request, res: Response): Promise<void> => {
    const { candidateId, amount } = req.body as DonateRequest;
    const candidate = await this.service.donate(req.actorId!, candidateId, amount.amount);
    res.status(200).json(candidate);
  };

  endElection = async (req: Request, res: Response): Promise<void> => {
    const election = await this.service.endElection(
      req.actorId!,
      req.params.electionId as string,
      req.actorRole,
    );
    res.status(200).json(election);
  };

  mayorPolicyAction = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as MayorPolicyActionRequest;
    const result = await this.service.performPolicyAction(req.actorId!, body);
    res.status(200).json(result);
  };
}

export const politicsController = new PoliticsController();
