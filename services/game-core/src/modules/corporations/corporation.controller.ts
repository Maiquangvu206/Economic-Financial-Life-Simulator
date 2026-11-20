import type { Request, Response } from 'express';
import type {
  AddCompanyGroupMemberRequest,
  CompanyInvestRequest,
  CompanyOperationRequest,
  CreateBuyoutOfferRequest,
  CreateCompanyGroupRequest,
  CreateCompanyRequest,
  CreateCompanyTaxFilingRequest,
  CreateHiringPlanRequest,
  CreateLedgerEntryRequest,
  DecideHiringCandidateRequest,
  DividendRequest,
  IpoCompanyRequest,
  MergeCompanyRequest,
  RelocateCompanyPremisesRequest,
  RenameCompanyGroupRequest,
  TakeoverRequest,
  TenderBuyoutOfferRequest,
  UpdateEmployeeSalaryRequest,
  UpdateStaffSalaryRequest,
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

  getPremisesOptions = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const options = await this.service.getPremisesOptions(userId);
    res.status(200).json(options);
  };

  createCompany = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { name, industry, initialCapital, premises } = req.body as CreateCompanyRequest;
    const company = await this.service.createCompany(userId, name, industry, initialCapital.amount, premises);
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
    const result = await this.service.payDividend(userId, companyId);
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
    const company = await this.service.collectRevenue(userId, companyId);
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
    res.status(200).json({ plan });
  };

  applyHiringPlan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, planId } = req.params as { companyId: string; planId: string };
    const result = await this.service.applyHiringPlan(userId, companyId, planId);
    res.status(200).json(result);
  };

  dismissHiringPlan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, planId } = req.params as { companyId: string; planId: string };
    await this.service.dismissHiringPlan(userId, companyId, planId);
    res.status(204).end();
  };

  fireStaff = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, staffId } = req.params as { companyId: string; staffId: string };
    await this.service.fireStaff(userId, companyId, staffId);
    res.status(204).end();
  };

  updateEmployeeSalary = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, employmentId } = req.params as { companyId: string; employmentId: string };
    const body = req.body as UpdateEmployeeSalaryRequest;
    const data = await this.service.updateEmployeeSalary(
      userId,
      companyId,
      employmentId,
      Number(body.salary?.amount ?? 0),
      body.reason,
    );
    res.status(200).json(data);
  };

  updateStaffSalary = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId, staffId } = req.params as { companyId: string; staffId: string };
    const body = req.body as UpdateStaffSalaryRequest;
    const data = await this.service.updateStaffSalary(
      userId,
      companyId,
      staffId,
      Number(body.salary?.amount ?? 0),
      body.reason,
    );
    res.status(200).json(data);
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
      declaredRevenueMinor: body.declaredRevenue.amount,
      usePersonalFundsForShortfall: Boolean((body as any).usePersonalFundsForShortfall),
      notes: body.notes,
    });
    res.status(201).json(data);
  };

  relocatePremises = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { premises } = req.body as RelocateCompanyPremisesRequest;
    const company = await this.service.relocatePremises(userId, companyId, premises as any);
    res.status(200).json(company);
  };

  setRevenueRetain = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { retainPct } = req.body as { retainPct: number };
    const company = await this.service.setRevenueRetain(userId, companyId, retainPct);
    res.status(200).json(company);
  };

  setOwnerSalary = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const { salary } = req.body as { salary: { amount: number; currency: string } };
    const hr = await this.service.setOwnerSalary(userId, companyId, Number(salary?.amount ?? 0));
    res.status(200).json(hr);
  };

  listShareOfferings = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const companyId = (req.params as any).companyId as string | undefined;
    const data = await this.service.listShareOfferings(userId, companyId);
    res.status(200).json(data);
  };

  createShareOffering = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { companyId } = req.params as { companyId: string };
    const body = req.body as any;
    const data = await this.service.createShareOffering(userId, companyId, {
      totalShares: Number(body.totalShares),
      pricePerShareMinor: Number(body.pricePerShare?.amount ?? 0),
      durationHours: Number(body.durationHours),
    });
    res.status(201).json(data);
  };

  buyShareOffering = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { offeringId } = req.params as { offeringId: string };
    const body = req.body as any;
    const data = await this.service.buyShareOffering(userId, offeringId, Number(body.shares));
    res.status(200).json(data);
  };

  getGroupOverview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const result = await this.service.getGroupOverview(userId);
    res.status(200).json(result);
  };

  getGroupDetail = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { groupId } = req.params as { groupId: string };
    const result = await this.service.getGroupDetail(userId, groupId);
    res.status(200).json(result);
  };

  createCompanyGroup = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as CreateCompanyGroupRequest;
    const result = await this.service.createCompanyGroup(userId, body.name, body.holdingCompanyId);
    res.status(201).json(result);
  };

  renameCompanyGroup = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { groupId } = req.params as { groupId: string };
    const body = req.body as RenameCompanyGroupRequest;
    const result = await this.service.renameCompanyGroup(userId, groupId, body.name);
    res.status(200).json(result);
  };

  dissolveCompanyGroup = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { groupId } = req.params as { groupId: string };
    await this.service.dissolveCompanyGroup(userId, groupId);
    res.status(204).send();
  };

  addCompanyGroupMember = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { groupId } = req.params as { groupId: string };
    const body = req.body as AddCompanyGroupMemberRequest;
    const result = await this.service.addCompanyGroupMember(userId, groupId, body.companyId);
    res.status(200).json(result);
  };

  removeCompanyGroupMember = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { groupId, companyId } = req.params as { groupId: string; companyId: string };
    const result = await this.service.removeCompanyGroupMember(userId, groupId, companyId);
    res.status(200).json(result);
  };

  listBuyoutOffers = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const result = await this.service.listBuyoutOffers(userId, companyId);
    res.status(200).json(result);
  };

  createBuyoutOffer = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as CreateBuyoutOfferRequest;
    const result = await this.service.createBuyoutOffer(userId, {
      companyId: body.companyId,
      pricePerShareMinor: body.pricePerShare.amount,
      durationHours: body.durationHours ?? 24,
      allowSqueezeOut: body.allowSqueezeOut !== false,
    });
    res.status(201).json(result);
  };

  tenderBuyoutOffer = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { offerId } = req.params as { offerId: string };
    const body = req.body as TenderBuyoutOfferRequest;
    const result = await this.service.tenderBuyoutOffer(userId, offerId, body.shares);
    res.status(200).json(result);
  };

  cancelBuyoutOffer = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { offerId } = req.params as { offerId: string };
    await this.service.cancelBuyoutOffer(userId, offerId);
    res.status(204).send();
  };

  squeezeOutBuyout = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { offerId } = req.params as { offerId: string };
    const result = await this.service.squeezeOutBuyout(userId, offerId);
    res.status(200).json(result);
  };

  mergeCompanies = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const body = req.body as MergeCompanyRequest;
    const result = await this.service.mergeCompanies(userId, body.survivorCompanyId, body.mergedCompanyId);
    res.status(200).json(result);
  };
}

export const corporationController = new CorporationController();

