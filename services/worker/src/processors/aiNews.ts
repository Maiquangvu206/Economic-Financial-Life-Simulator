import { logger } from '../logger.js';

/**
 * Calls the AI service for a news proposal, then hands it to the law/news
 * module for rule validation before any stock impact is applied.
 */
export async function processAiNews(): Promise<{ skipped: true; reason: string }> {
  logger.info('ai-news job requested but not wired yet');
  return { skipped: true, reason: 'AI client not implemented' };
}
