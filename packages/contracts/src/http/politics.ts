import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const ElectionDtoSchema = z.object({
  id: IdSchema,
  office: z.enum(['mayor']),
  status: z.enum(['open', 'ended']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  winnerCandidateId: IdSchema.nullable(),
  youVoted: z.boolean(),
  youCandidateId: IdSchema.nullable(),
});
export type ElectionDto = z.infer<typeof ElectionDtoSchema>;

export const CandidateDtoSchema = z.object({
  id: IdSchema,
  characterId: IdSchema,
  name: z.string(),
  votes: z.number().int().nonnegative(),
  donations: MoneySchema,
  score: z.number().int().nonnegative(),
  isMe: z.boolean(),
});
export type CandidateDto = z.infer<typeof CandidateDtoSchema>;

export const PoliticsOverviewDtoSchema = z.object({
  election: ElectionDtoSchema.nullable(),
  candidates: z.array(CandidateDtoSchema),
});
export type PoliticsOverviewDto = z.infer<typeof PoliticsOverviewDtoSchema>;

export const CreateElectionRequestSchema = z.object({
  office: z.enum(['mayor']).default('mayor'),
  endsAt: z.string().datetime().optional(),
});
export type CreateElectionRequest = z.infer<typeof CreateElectionRequestSchema>;

export const DeclareCandidacyRequestSchema = z.object({
  electionId: IdSchema,
  name: z.string().min(2).max(80),
});
export type DeclareCandidacyRequest = z.infer<typeof DeclareCandidacyRequestSchema>;

export const VoteRequestSchema = z.object({
  electionId: IdSchema,
  candidateId: IdSchema,
});
export type VoteRequest = z.infer<typeof VoteRequestSchema>;

export const DonateRequestSchema = z.object({
  candidateId: IdSchema,
  amount: MoneySchema,
});
export type DonateRequest = z.infer<typeof DonateRequestSchema>;
