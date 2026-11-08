import type { Request, Response } from 'express';
import {
  type AssessRequest,
  type PayTaxRequest,
  type ReportRequest,
  type RevokeLicenseRequest,
  type StartAuditRequest,
} from '@efls/contracts';
import { TaxService } from './tax.service.js';

export class TaxController {
  constructor(private readonly service: TaxService = new TaxService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.service.getOverview(req.actorId!);
    res.status(200).json(overview);
  };

  assess = async (req: Request, res: Response): Promise<void> => {
    const { taxYear } = req.body as AssessRequest;
    const overview = await this.service.assess(req.actorId!, taxYear);
    res.status(200).json(overview);
  };

  pay = async (req: Request, res: Response): Promise<void> => {
    const { assessmentId } = req.body as PayTaxRequest;
    const overview = await this.service.pay(req.actorId!, assessmentId);
    res.status(200).json(overview);
  };

  startAudit = async (req: Request, res: Response): Promise<void> => {
    const { taxYear } = req.body as StartAuditRequest;
    const overview = await this.service.startAudit(req.actorId!, taxYear);
    res.status(200).json(overview);
  };

  report = async (req: Request, res: Response): Promise<void> => {
    const { targetCharacterId, reason } = req.body as ReportRequest;
    await this.service.report(req.actorId!, targetCharacterId, reason);
    res.status(200).json({ ok: true });
  };

  revokeLicense = async (req: Request, res: Response): Promise<void> => {
    const { licenseId } = req.body as RevokeLicenseRequest;
    const overview = await this.service.revokeLicense(req.actorId!, licenseId);
    res.status(200).json(overview);
  };
}

export const taxController = new TaxController();
