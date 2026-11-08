import type { Request, Response } from 'express';
import { type OpenCaseRequest, type SubmitEvidenceRequest } from '@efls/contracts';
import { LawService } from './law.service.js';

export class LawController {
  constructor(private readonly service: LawService = new LawService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  openCase = async (req: Request, res: Response): Promise<void> => {
    const { crimeType } = req.body as OpenCaseRequest;
    const courtCase = await this.service.openCase(req.actorId!, crimeType);
    res.status(200).json(courtCase);
  };

  submitEvidence = async (req: Request, res: Response): Promise<void> => {
    const { caseId, strength, description } = req.body as SubmitEvidenceRequest;
    const evidence = await this.service.submitEvidence(req.actorId!, caseId, strength, description);
    res.status(200).json(evidence);
  };

  trial = async (req: Request, res: Response): Promise<void> => {
    const result = await this.service.trial(req.actorId!, req.params.caseId as string);
    res.status(200).json(result);
  };
}

export const lawController = new LawController();
