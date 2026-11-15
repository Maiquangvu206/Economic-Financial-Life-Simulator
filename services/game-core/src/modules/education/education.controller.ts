import type { Request, Response } from 'express';
import {
  type EnrollUniversityRequest,
  type GraduateRequest,
  type DropDegreeRequest,
  type EarlyGraduateRequest,
  type EarlyGraduateSubmitRequest,
} from '@efls/contracts';
import { EducationService } from './education.service.js';

export class EducationController {
  constructor(private readonly service: EducationService = new EducationService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  enroll = async (req: Request, res: Response): Promise<void> => {
    const { universityId } = req.body as EnrollUniversityRequest;
    const overview = await this.service.enroll(req.actorId!, universityId);
    res.status(200).json(overview);
  };

  graduate = async (req: Request, res: Response): Promise<void> => {
    const { degreeId } = req.body as GraduateRequest;
    const result = await this.service.graduate(req.actorId!, degreeId);
    res.status(200).json(result);
  };

  drop = async (req: Request, res: Response): Promise<void> => {
    const { degreeId } = req.body as DropDegreeRequest;
    const overview = await this.service.drop(req.actorId!, degreeId);
    res.status(200).json(overview);
  };

  earlyGraduateStart = async (req: Request, res: Response): Promise<void> => {
    const { degreeId } = req.body as EarlyGraduateRequest;
    const result = await this.service.startEarlyGraduateTest(req.actorId!, degreeId);
    res.status(200).json(result);
  };

  earlyGraduateSubmit = async (req: Request, res: Response): Promise<void> => {
    const body = req.body as EarlyGraduateSubmitRequest;
    const result = await this.service.submitEarlyGraduateTest(req.actorId!, body);
    res.status(200).json(result);
  };
}

export const educationController = new EducationController();
