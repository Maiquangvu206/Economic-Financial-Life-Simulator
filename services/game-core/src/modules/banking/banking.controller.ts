import type { Request, Response } from 'express';
import type {
  ApplyLoanRequest,
  CreateTransferRequest,
  RepayLoanRequest,
  SavingsDepositRequest,
  SavingsWithdrawRequest,
  SavingsWithdrawInterestRequest,
} from '@efls/contracts';
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
      collateralCompanyId: input.collateralCompanyId ?? undefined,
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
    const input = req.body as SavingsDepositRequest;
    const savings = await this.service.depositSavings(
      userId,
      input.amount.amount,
      input.termMonths ?? 0,
    );
    res.json(savings);
  };

  withdrawSavings = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const input = req.body as SavingsWithdrawRequest;
    const savings = await this.service.withdrawSavings(
      userId,
      input.amount.amount,
      input.depositId,
    );
    res.json(savings);
  };

  withdrawSavingsInterest = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const input = req.body as SavingsWithdrawInterestRequest;
    const savings = await this.service.withdrawSavingsInterest(userId, input.depositId);
    res.json(savings);
  };

  getLoan = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const { loanId } = req.params as { loanId: string };
    const loan = await this.service.getLoan(userId, loanId);
    res.json(loan);
  };

  lookupTransfer = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const cccd = req.query.cccd != null ? String(req.query.cccd) : undefined;
    const accountNumber = req.query.accountNumber != null ? String(req.query.accountNumber) : undefined;
    const result = await this.service.lookupTransferRecipient(userId, { cccd, accountNumber });
    res.json(result);
  };

  createTransfer = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const input = req.body as CreateTransferRequest;
    const result = await this.service.createTransfer(userId, {
      targetCccd: input.targetCccd,
      toAccountNumber: input.toAccountNumber,
      amountMinor: input.amount.amount,
      message: input.message,
    });
    res.status(201).json(result);
  };

  listTransfers = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const transfers = await this.service.listTransfers(userId);
    res.json({ transfers });
  };

  history = async (req: Request, res: Response): Promise<void> => {
    const userId = requireActorId(req);
    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 30;
    const items = await this.service.getAccountHistory(userId, Number.isFinite(limitRaw) ? limitRaw : 30);
    res.json({ items });
  };
}
