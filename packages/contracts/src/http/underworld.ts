import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { CrimeTypeSchema } from '../enums/index.js';

export const UnderworldServiceSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string(),
  heat: z.number().int(),
  minPayout: MoneySchema,
  maxPayout: MoneySchema,
  risk: z.number().int(),
});
export type UnderworldService = z.infer<typeof UnderworldServiceSchema>;

export const HeatEventDtoSchema = z.object({
  id: IdSchema,
  delta: z.number().int(),
  reason: z.string(),
  createdAt: z.string().datetime(),
});
export type HeatEventDto = z.infer<typeof HeatEventDtoSchema>;

export const FakeCredentialDtoSchema = z.object({
  id: IdSchema,
  kind: z.string(),
  quality: z.number().int(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});
export type FakeCredentialDto = z.infer<typeof FakeCredentialDtoSchema>;

export const UnderworldOverviewDtoSchema = z.object({
  heatLevel: z.number().int(),
  services: z.array(UnderworldServiceSchema),
  heatEvents: z.array(HeatEventDtoSchema),
  credentials: z.array(FakeCredentialDtoSchema),
});
export type UnderworldOverviewDto = z.infer<typeof UnderworldOverviewDtoSchema>;

export const CommitCrimeRequestSchema = z.object({
  crimeType: CrimeTypeSchema,
});
export type CommitCrimeRequest = z.infer<typeof CommitCrimeRequestSchema>;

export const BuyCredentialRequestSchema = z.object({
  kind: z.enum(['fake_id', 'business_license', 'shell_company']),
});
export type BuyCredentialRequest = z.infer<typeof BuyCredentialRequestSchema>;
