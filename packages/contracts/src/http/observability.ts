import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { AiTaskSchema } from '../enums/index.js';

export const NpcPersonalitySchema = z.enum(['aggressive', 'cautious', 'greedy', 'honest']);
export type NpcPersonality = z.infer<typeof NpcPersonalitySchema>;

export const NpcNegotiateRequestSchema = z.object({
  npcId: z.string().min(1).max(80),
  personality: NpcPersonalitySchema,
  context: z.string().max(4000),
  playerOffer: z.string().max(2000),
  fairValue: z.number().int().nonnegative(),
  offerMinor: z.number().int().nonnegative(),
});
export type NpcNegotiateRequest = z.infer<typeof NpcNegotiateRequestSchema>;

export const NpcNegotiateResponseSchema = z.object({
  proposalId: IdSchema,
  dialogue: z.string(),
  accept: z.boolean(),
  counterOfferMinor: z.number().int().nonnegative().nullable(),
  moodDelta: z.number().min(-1).max(1),
  offerMinor: z.number().int().nonnegative(),
  personality: NpcPersonalitySchema,
});
export type NpcNegotiateResponse = z.infer<typeof NpcNegotiateResponseSchema>;

export const NpcNegotiationDtoSchema = z.object({
  id: IdSchema,
  npcId: z.string(),
  personality: NpcPersonalitySchema,
  dialogue: z.string(),
  accept: z.boolean(),
  counterOffer: MoneySchema.nullable(),
  moodDelta: z.number(),
  createdAt: z.string().datetime(),
});
export type NpcNegotiationDto = z.infer<typeof NpcNegotiationDtoSchema>;

export const GmSnapshotDtoSchema = z.object({
  inflationPct: z.number(),
  unemploymentPct: z.number(),
  moneySupply: MoneySchema,
  marketCap: MoneySchema,
  baseRatePct: z.number(),
});
export type GmSnapshotDto = z.infer<typeof GmSnapshotDtoSchema>;

export const GmDirectiveDtoSchema = z.object({
  id: IdSchema,
  action: z.enum(['raise_rate', 'cut_rate', 'trigger_crisis', 'stimulus', 'do_nothing']),
  magnitude: z.number().min(0).max(1),
  rationale: z.string(),
  snapshot: z.object({
    inflationPct: z.number(),
    unemploymentPct: z.number(),
    moneySupply: MoneySchema,
    marketCap: MoneySchema,
  }),
  applied: z.boolean(),
  createdAt: z.string().datetime(),
});
export type GmDirectiveDto = z.infer<typeof GmDirectiveDtoSchema>;

export const NewsBroadcastDtoSchema = z.object({
  id: IdSchema,
  headline: z.string(),
  body: z.string(),
  stockImpact: z.record(z.string(), z.number()),
  createdAt: z.string().datetime(),
});
export type NewsBroadcastDto = z.infer<typeof NewsBroadcastDtoSchema>;

export const AiMetricDtoSchema = z.object({
  id: IdSchema,
  task: AiTaskSchema,
  model: z.string(),
  promptVersion: z.string(),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number(),
  status: z.enum(['ok', 'error']),
  createdAt: z.string().datetime(),
});
export type AiMetricDto = z.infer<typeof AiMetricDtoSchema>;

export const AiMetricsOverviewDtoSchema = z.object({
  generate: z.object({
    totalCalls: z.number().int(),
    totalCostUsd: z.number(),
    avgLatencyMs: z.number(),
    errorRate: z.number(),
  }),
  byTask: z.array(
    z.object({
      task: AiTaskSchema,
      totalCalls: z.number().int(),
      avgLatencyMs: z.number(),
      totalCostUsd: z.number(),
      errorRate: z.number(),
    }),
  ),
  recent: z.array(AiMetricDtoSchema),
});
export type AiMetricsOverviewDto = z.infer<typeof AiMetricsOverviewDtoSchema>;
