import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { AiTaskSchema } from '../enums/index.js';

/**
 * AI is ADVISORY ONLY.
 *
 * The AI service returns a proposal. The game core validates it against the
 * deterministic rules in @efls/domain before it can change any state.
 */
export const AiProposalMetaSchema = z.object({
  proposalId: IdSchema,
  task: AiTaskSchema,
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string().datetime(),
});
export type AiProposalMeta = z.infer<typeof AiProposalMetaSchema>;

export const JudgeRequestSchema = z.object({
  caseId: IdSchema,
  defendantId: IdSchema,
  charges: z.array(z.string()),
  evidenceIds: z.array(IdSchema),
  defenseStatement: z.string().min(1).max(4000),
  characterHasLawDegree: z.boolean(),
});
export type JudgeRequest = z.infer<typeof JudgeRequestSchema>;

export const JudgeVerdictProposalSchema = z.object({
  meta: AiProposalMetaSchema,
  verdict: z.enum(['guilty', 'not_guilty', 'settlement']),
  sentenceYears: z.number().int().min(0).max(100),
  fine: z.object({ amount: z.number().int().nonnegative(), currency: z.literal('USD') }),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});
export type JudgeVerdictProposal = z.infer<typeof JudgeVerdictProposalSchema>;

export const NewsRequestSchema = z.object({
  eventId: IdSchema,
  eventType: z.string(),
  actors: z.array(z.object({ id: IdSchema, displayName: z.string() })),
  facts: z.array(z.string()),
  tone: z.enum(['neutral', 'sensational', 'investigative']).default('neutral'),
});
export type NewsRequest = z.infer<typeof NewsRequestSchema>;

export const NewsProposalSchema = z.object({
  meta: AiProposalMetaSchema,
  headline: z.string(),
  body: z.string(),
  reputationDelta: z.record(z.string(), z.number().min(-100).max(100)),
  stockImpactPct: z.record(z.string(), z.number().min(-20).max(20)),
});
export type NewsProposal = z.infer<typeof NewsProposalSchema>;

export const NpcNegotiationRequestSchema = z.object({
  npcId: IdSchema,
  personality: z.enum(['aggressive', 'cautious', 'greedy', 'honest']),
  context: z.string().max(4000),
  playerOffer: z.string().max(2000),
  fairValue: z.number().int(),
});
export type NpcNegotiationRequest = z.infer<typeof NpcNegotiationRequestSchema>;

export const NpcNegotiationProposalSchema = z.object({
  meta: AiProposalMetaSchema,
  dialogue: z.string(),
  accept: z.boolean(),
  counterOffer: z.number().int().nullable(),
  moodDelta: z.number().min(-1).max(1),
});
export type NpcNegotiationProposal = z.infer<typeof NpcNegotiationProposalSchema>;

export const GmRequestSchema = z.object({
  snapshot: z.object({
    inflationPct: z.number(),
    unemploymentPct: z.number(),
    moneySupply: z.number().int(),
    marketCap: z.number().int(),
  }),
  allowedActions: z.array(
    z.enum(['raise_rate', 'cut_rate', 'trigger_crisis', 'stimulus', 'do_nothing']),
  ),
});
export type GmRequest = z.infer<typeof GmRequestSchema>;

export const GmDirectiveProposalSchema = z.object({
  meta: AiProposalMetaSchema,
  action: z.enum(['raise_rate', 'cut_rate', 'trigger_crisis', 'stimulus', 'do_nothing']),
  magnitude: z.number().min(0).max(1),
  rationale: z.string(),
});
export type GmDirectiveProposal = z.infer<typeof GmDirectiveProposalSchema>;
