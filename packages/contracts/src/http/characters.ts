import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { ZoneTypeSchema } from '../enums/index.js';

export const MaritalStatusSchema = z.enum(['single', 'married', 'divorced', 'widowed']);
export type MaritalStatus = z.infer<typeof MaritalStatusSchema>;

export const AccountTierSchema = z.enum(['standard', 'silver', 'gold', 'platinum', 'diamond']);
export type AccountTier = z.infer<typeof AccountTierSchema>;

export const CharacterDtoSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  fullName: z.string(),
  accountNumber: z.string(),
  accountTier: AccountTierSchema,
  cccd: z.string(),
  birthplace: z.string().nullable(),
  birthplaceName: z.string().nullable(),
  age: z.number().int().min(0),
  healthEnergy: z.number().int().min(0).max(100),
  creditScore: z.number().int().min(300).max(850),
  heatLevel: z.number().int().min(0).max(100),
  isAlive: z.boolean().default(true),
  maritalStatus: MaritalStatusSchema,
  spouseId: IdSchema.nullable(),
  location: z.object({ x: z.number().int(), y: z.number().int() }),
  cash: MoneySchema,
  netWorth: MoneySchema,
  createdAt: z.string().datetime(),
});
export type CharacterDto = z.infer<typeof CharacterDtoSchema>;

export const ResolveCccdResponseSchema = z.object({
  cccd_masked: z.string(),
  full_name: z.string(),
  is_alive: z.boolean(),
});
export type ResolveCccdResponse = z.infer<typeof ResolveCccdResponseSchema>;

export const EligibleSuccessorDtoSchema = z.object({
  id: IdSchema,
  cccd: z.string(),
  full_name: z.string(),
  age: z.number().int(),
  relation: z.string(),
  generation_level: z.number().int(),
  health_energy: z.number().int(),
});
export type EligibleSuccessorDto = z.infer<typeof EligibleSuccessorDtoSchema>;

export const SuccessionRequestSchema = z.object({
  successorId: IdSchema.nullable().optional(),
});
export type SuccessionRequest = z.infer<typeof SuccessionRequestSchema>;

export const AccountLookupDtoSchema = z.object({
  accountNumber: z.string(),
  characterId: IdSchema,
  fullName: z.string(),
  accountTier: AccountTierSchema,
});
export type AccountLookupDto = z.infer<typeof AccountLookupDtoSchema>;

export const ProvinceDtoSchema = z.object({
  code: z.string(),
  name: z.string(),
  region: z.enum(['Bắc', 'Trung', 'Nam']),
  isCity: z.boolean(),
});
export type ProvinceDto = z.infer<typeof ProvinceDtoSchema>;

export const CreateCharacterRequestSchema = z.object({
  fullName: z.string().min(2).max(80),
  birthplaceCode: z.string().length(3).optional(),
  startingZone: ZoneTypeSchema.optional(),
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

export const UpdateLocationRequestSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});
export type UpdateLocationRequest = z.infer<typeof UpdateLocationRequestSchema>;
