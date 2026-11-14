import { Router } from 'express';
import {
  ApplyLoanRequestSchema,
  CreateTransferRequestSchema,
  RepayLoanRequestSchema,
  SavingsDepositRequestSchema,
  SavingsWithdrawRequestSchema,
} from '@efls/contracts';
import { asyncHandler } from '../../shared/http/asyncHandler.js';
import { validateBody } from '../../shared/http/validate.js';
import { BankingController } from './banking.controller.js';

const controller = new BankingController();

export const bankingRouter: Router = Router();

bankingRouter.get('/overview', asyncHandler(controller.overview));

bankingRouter.post(
  '/loans',
  validateBody(ApplyLoanRequestSchema),
  asyncHandler(controller.applyLoan),
);
bankingRouter.get('/loans/:loanId', asyncHandler(controller.getLoan));
bankingRouter.post(
  '/loans/:loanId/repay',
  validateBody(RepayLoanRequestSchema),
  asyncHandler(controller.repayLoan),
);
bankingRouter.post(
  '/savings/deposit',
  validateBody(SavingsDepositRequestSchema),
  asyncHandler(controller.depositSavings),
);
bankingRouter.post(
  '/savings/withdraw',
  validateBody(SavingsWithdrawRequestSchema),
  asyncHandler(controller.withdrawSavings),
);

// Chuyển khoản theo số tài khoản (STK) - thời gian thực
bankingRouter.get('/transfers/lookup', asyncHandler(controller.lookupTransfer));
bankingRouter.get('/transfers', asyncHandler(controller.listTransfers));
bankingRouter.post(
  '/transfers',
  validateBody(CreateTransferRequestSchema),
  asyncHandler(controller.createTransfer),
);
