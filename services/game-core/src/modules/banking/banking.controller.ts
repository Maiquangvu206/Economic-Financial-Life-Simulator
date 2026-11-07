import type { Request, Response } from 'express';
import type { ApplyLoanRequest, RepayLoanRequest, SavingsRequest } from '@efls/contracts';
import { requireActorId } from '../../shared/http/actor.js';
import { BankingService } from './banking.service.js';

export class BankingController {
  constructor(private readonly service: BankingService = new BankingService()) {}

  overview = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const overview = await this.service.getOverview(userId);
    res.json(overview);
  };

  applyLoan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const input = req.body as ApplyLoanRequest;
    const loan = await this.service.applyLoan(userId, {
      amountMinor: input.amount.amount,
      termMonths: input.termMonths,
      collateralPropertyId: input.collateralPropertyId ?? undefined,
    });
    res.status(201).json(loan);
  };

  repayLoan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { loanId } = req.params as { loanId: string };
    const input = req.body as RepayLoanRequest;
    const loan = await this.service.repayLoan(userId, loanId, input.amount.amount);
    res.json(loan);
  };

  depositSavings = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const input = req.body as SavingsRequest;
    const savings = await this.service.depositSavings(userId, input.amount.amount);
    res.json(savings);
  };

  withdrawSavings = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const input = req.body as SavingsRequest;
    const savings = await this.service.withdrawSavings(userId, input.amount.amount);
    res.json(savings);
  };

  getLoan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { loanId } = req.params as { loanId: string };
    const loan = await this.service.getLoan(userId, loanId);
    res.json(loan);
  };
}
