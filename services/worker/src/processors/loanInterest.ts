import { logger } from '../logger.js';

/**
 * Accrues interest for active loans and moves overdue loans through
 * grace -> default -> foreclosure. Implementation belongs to the banking
 * module and must reuse @efls/domain/banking.
 */
export async function processLoanInterest(): Promise<{ skipped: true; reason: string }> {
  logger.info('loan-interest job requested but not wired yet');
  return { skipped: true, reason: 'banking module not implemented' };
}
