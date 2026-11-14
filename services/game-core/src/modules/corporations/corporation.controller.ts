import type { Request, Response } from 'express';
import type {
  CompanyInvestRequest,
  CompanyOperationRequest,
  CreateCompanyRequest,
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
    const { buyerCharacterId } = req.body as TakeoverRequest;
    const company = await this.service.takeoverCompany(userId, companyId, buyerCharacterId);
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
}

export const corporationController = new CorporationController();
