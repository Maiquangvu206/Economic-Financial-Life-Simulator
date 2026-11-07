import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { ZoneTypeSchema } from '../enums/index.js';

export const MaritalStatusSchema = z.enum(['single', 'married', 'divorced', 'widowed']);
export type MaritalStatus = z.infer<typeof MaritalStatusSchema>;

export const CharacterDtoSchema = z.object({
  id: IdSchema,
  userId: IdSchema,
  fullName: z.string(),
  age: z.number().int().min(0),
  healthEnergy: z.number().int().min(0).max(100),
  creditScore: z.number().int().min(300).max(850),
  heatLevel: z.number().int().min(0).max(100),
  maritalStatus: MaritalStatusSchema,
  spouseId: IdSchema.nullable(),
  location: z.object({ x: z.number().int(), y: z.number().int() }),
  netWorth: MoneySchema,
  createdAt: z.string().datetime(),
});
export type CharacterDto = z.infer<typeof CharacterDtoSchema>;

export const CreateCharacterRequestSchema = z.object({
  fullName: z.string().min(2).max(80),
  startingZone: ZoneTypeSchema.optional(),
});
export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

export const UpdateLocationRequestSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});
export type UpdateLocationRequest = z.infer<typeof UpdateLocationRequestSchema>;

export const OfflineRecapDtoSchema = z.object({
  characterId: IdSchema,
  from: z.string().datetime(),
  to: z.string().datetime(),
  income: MoneySchema,
  expenses: MoneySchema,
  netCashFlow: MoneySchema,
  stockMovements: z.array(
    z.object({
      ticker: z.string(),
      changePct: z.number(),
    }),
  ),
  events: z.array(z.object({ type: z.string(), message: z.string() })),
});
export type OfflineRecapDto = z.infer<typeof OfflineRecapDtoSchema>;
