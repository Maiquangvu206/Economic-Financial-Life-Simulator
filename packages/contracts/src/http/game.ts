import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { MaritalStatusSchema } from './characters.js';

export const MacroIndicatorsSchema = z.object({
  inflationPct: z.number(),
  cpi: z.number(),
  baseRatePct: z.number(),
  unemploymentPct: z.number(),
  gdpGrowthPct: z.number(),
});
export type MacroIndicators = z.infer<typeof MacroIndicatorsSchema>;

export const GameStateDtoSchema = z.object({
  currentDay: z.number().int(),
  currentYear: z.number().int(),
  season: z.enum(['spring', 'summer', 'autumn', 'winter']),
  macro: MacroIndicatorsSchema,
  updatedAt: z.string().datetime(),
});
export type GameStateDto = z.infer<typeof GameStateDtoSchema>;

/** Everything the shell needs after login: identity, money and world clock. */
export const DashboardDtoSchema = z.object({
  character: z.object({
    id: IdSchema,
    fullName: z.string(),
    age: z.number().int(),
    creditScore: z.number().int(),
    heatLevel: z.number().int(),
    maritalStatus: MaritalStatusSchema,
    cash: MoneySchema,
    netWorth: MoneySchema,
  }),
  gameState: GameStateDtoSchema,
  unreadNotifications: z.number().int(),
  activeLoans: z.number().int(),
  employments: z.number().int(),
});
export type DashboardDto = z.infer<typeof DashboardDtoSchema>;
