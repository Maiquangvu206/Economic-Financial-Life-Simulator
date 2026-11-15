import type { Request, Response } from 'express';
import type { CreateRecruitmentJobRequest } from '@efls/contracts';
import { requireActorId } from '../../shared/http/actor.js';
import { RecruitmentService } from './recruitment.service.js';

export class RecruitmentController {
  constructor(private readonly service: RecruitmentService = new RecruitmentService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const overview = await this.service.getOverview(userId);
    res.status(200).json(overview);
  };

  createJob = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as CreateRecruitmentJobRequest;
    const result = await this.service.createJob(userId, {
      companyId: body.companyId,
      title: body.title,
      industry: body.industry,
      baseSalaryMinor: body.baseSalary.amount,
      requiredDegree: body.requiredDegree ?? null,
      minCreditScore: body.minCreditScore ?? 0,
      energyCost: body.energyCost ?? 10,
      openings: body.openings ?? 1,
    });
    res.status(201).json(result);
  };

  apply = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { jobId } = req.params as { jobId: string };
    const result = await this.service.apply(userId, jobId);
    res.status(200).json(result);
  };
}

export const recruitmentController = new RecruitmentController();
