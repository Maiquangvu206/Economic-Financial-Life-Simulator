import type { Request, Response } from 'express';
import type {
  CompanyInvestRequest,
  CompanyOperationRequest,
  CreateCompanyRequest,
  CreateCompanyTaxFilingRequest,
  CreateHiringPlanRequest,
  CreateLedgerEntryRequest,
  DecideHiringCandidateRequest,
  DividendRequest,
  IpoCompanyRequest,
  TakeoverRequest,
} from '@efls/contracts';
import { requireActorId } from '../../shared/http/actor.js';
import { CorporationService } from './corporation.service.js';

export class CorporationController {
  constructor(private readonly service: CorporationService = new CorporationService()) {}

  getOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const overview = await this.service.getOverview(userId);
    res.status(200).json(overview);
  };

  getCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const company = await this.service.getCompany(userId, companyId);
    res.status(200).json(company);
  };

  createCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { name, industry, initialCapital } = req.body as CreateCompanyRequest;
    const company = await this.service.createCompany(userId, name, industry, initialCapital.amount);
    res.status(201).json(company);
  };

  investCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { amount } = req.body as CompanyInvestRequest;
    const company = await this.service.investCompany(userId, companyId, amount.amount);
    res.status(200).json(company);
  };

  ipoCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { tickerSymbol, initialPrice, totalShares } = req.body as IpoCompanyRequest;
    const company = await this.service.ipoCompany(
      userId,
      companyId,
      tickerSymbol,
      initialPrice.amount,
      totalShares,
    );
    res.status(200).json(company);
  };

  payDividend = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { amountPerShare } = req.body as DividendRequest;
    const result = await this.service.payDividend(userId, companyId, amountPerShare.amount);
    res.status(200).json(result);
  };

    takeoverCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { buyerCccd, buyerCharacterId } = req.body as TakeoverRequest;
    const company = await this.service.takeoverCompany(userId, companyId, { buyerCccd, buyerCharacterId });
    res.status(200).json(company);
  };

  getEmployees = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const employees = await this.service.getEmployees(userId, companyId);
    res.status(200).json(employees);
  };

  fireEmployee = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, employmentId } = req.params as { companyId: string; employmentId: string };
    await this.service.fireEmployee(userId, companyId, employmentId);
    res.status(204).end();
  };

  dissolveCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const company = await this.service.dissolveCompany(userId, companyId);
    res.status(200).json(company);
  };

  collectRevenue = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { amount, note } = req.body as CompanyOperationRequest;
    const company = await this.service.collectRevenue(userId, companyId, amount.amount, note);
    res.status(200).json(company);
  };

  payOpex = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { amount, note } = req.body as CompanyOperationRequest;
    const company = await this.service.payOpex(userId, companyId, amount.amount, note);
    res.status(200).json(company);
  };

  getHrAccounting = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const data = await this.service.getHrAccounting(userId, companyId);
    res.status(200).json(data);
  };

  createHiringPlan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const body = req.body as CreateHiringPlanRequest;
    const plan = await this.service.createHiringPlan(userId, companyId, {
      roleFocus: body.roleFocus,
      headcount: body.headcount ?? 3,
      budgetMinor: body.budget?.amount,
      context: body.context,
    });
    res.status(201).json(plan);
  };

  decideHiringCandidate = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, planId, candidateId } = req.params as {
      companyId: string;
      planId: string;
      candidateId: string;
    };
    const { decision } = req.body as DecideHiringCandidateRequest;
    const plan = await this.service.decideHiringCandidate(
      userId,
      companyId,
      planId,
      candidateId,
      decision,
    );
    res.status(200).json(plan);
  };

  applyHiringPlan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, planId } = req.params as { companyId: string; planId: string };
    const plan = await this.service.applyHiringPlan(userId, companyId, planId);
    res.status(200).json(plan);
  };

  fireStaff = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, staffId } = req.params as { companyId: string; staffId: string };
    await this.service.fireStaff(userId, companyId, staffId);
    res.status(204).end();
  };

  addLedgerEntry = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const body = req.body as CreateLedgerEntryRequest;
    const data = await this.service.addLedgerEntry(userId, companyId, {
      entryType: body.entryType,
      amountMinor: body.amount.amount,
      declaredAmountMinor: body.declaredAmount?.amount,
      description: body.description,
      isEvasion: body.isEvasion,
      applyToCash: body.applyToCash,
    });
    res.status(201).json(data);
  };

  createTaxFiling = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const body = req.body as CreateCompanyTaxFilingRequest;
    const data = await this.service.createTaxFiling(userId, companyId, {
      period: body.period,
      declareFull: body.declareFull,
      adjustmentDeclaredRevenue: body.adjustmentDeclaredRevenue?.amount,
      adjustmentDeclaredExpense: body.adjustmentDeclaredExpense?.amount,
      notes: body.notes,
    });
    res.status(201).json(data);
  };
}

export const corporationController = new CorporationController();

