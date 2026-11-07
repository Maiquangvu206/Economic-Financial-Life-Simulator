import { logger } from '../logger.js';

/**
 * Computes audit risk with @efls/domain/tax/auditRisk and rolls a
 * server-side RNG. High-risk cases open a court case.
 */
export async function processTaxAudit(): Promise<{ skipped: true; reason: string }> {
  logger.info('tax-audit job requested but not wired yet');
  return { skipped: true, reason: 'audit module not implemented' };
}
