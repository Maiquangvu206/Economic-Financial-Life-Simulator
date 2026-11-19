import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const TravelTripKindSchema = z.enum(['short', 'retreat']);
export type TravelTripKind = z.infer<typeof TravelTripKindSchema>;

export const TravelTripStatusSchema = z.enum(['active', 'completed', 'cancelled']);
export type TravelTripStatus = z.infer<typeof TravelTripStatusSchema>;

export const TravelLodgingTypeSchema = z.enum(['npc_hotel', 'player_property', 'none']);
export type TravelLodgingType = z.infer<typeof TravelLodgingTypeSchema>;

export const TravelTripDtoSchema = z.object({
  id: IdSchema,
  provinceCode: z.string(),
  provinceName: z.string().nullable(),
  tripKind: TravelTripKindSchema,
  status: TravelTripStatusSchema,
  startGameYear: z.number().int(),
  startGameDay: z.number().int(),
  endGameYear: z.number().int(),
  endGameDay: z.number().int(),
  durationDays: z.number().int(),
  isPeakSeason: z.boolean(),
  priceMultiplier: z.number(),
  ticketCost: MoneySchema,
  lodgingCost: MoneySchema,
  totalCost: MoneySchema,
  energyReward: z.number().int(),
  rewardApplied: z.boolean(),
  lodgingType: TravelLodgingTypeSchema,
  lodgingPropertyId: IdSchema.nullable().optional(),
  lodgingPropertySource: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable().optional(),
});
export type TravelTripDto = z.infer<typeof TravelTripDtoSchema>;

export const TravelDestinationDtoSchema = z.object({
  provinceCode: z.string(),
  provinceName: z.string(),
  region: z.string(),
  isCity: z.boolean(),
  isPeakSeason: z.boolean(),
  season: z.string(),
  priceMultiplier: z.number(),
  shortTripTicket: MoneySchema,
  shortTripEnergy: z.number().int(),
  retreatEnergyByDays: z.record(z.string(), z.number().int()),
});
export type TravelDestinationDto = z.infer<typeof TravelDestinationDtoSchema>;

export const LodgingOptionDtoSchema = z.object({
  id: z.string(),
  type: TravelLodgingTypeSchema,
  name: z.string(),
  provinceCode: z.string(),
  perDayCost: MoneySchema,
  totalCost: MoneySchema,
  description: z.string().nullable().optional(),
  ownerCharacterId: IdSchema.nullable().optional(),
  ownerName: z.string().nullable().optional(),
  propertyId: IdSchema.nullable().optional(),
  propertySource: z.string().nullable().optional(),
});
export type LodgingOptionDto = z.infer<typeof LodgingOptionDtoSchema>;

export const TravelOverviewDtoSchema = z.object({
  inActiveTrip: z.boolean(),
  activeTrip: TravelTripDtoSchema.nullable(),
  destinations: z.array(TravelDestinationDtoSchema),
  history: z.array(TravelTripDtoSchema),
  gameTime: z.object({
    year: z.number().int(),
    month: z.number().int(),
    day: z.number().int(),
    dayOfYear: z.number().int(),
    hour: z.number().int(),
    minute: z.number().int(),
    season: z.string(),
  }),
});
export type TravelOverviewDto = z.infer<typeof TravelOverviewDtoSchema>;

export const StartShortTripRequestSchema = z.object({
  provinceCode: z.string().min(1),
});
export type StartShortTripRequest = z.infer<typeof StartShortTripRequestSchema>;

export const StartShortTripResponseSchema = z.object({
  ok: z.boolean(),
  trip: TravelTripDtoSchema,
  healthEnergy: z.number().int(),
  energyGain: z.number().int(),
  totalCost: MoneySchema,
  message: z.string(),
});
export type StartShortTripResponse = z.infer<typeof StartShortTripResponseSchema>;

export const GetLodgingOptionsRequestSchema = z.object({
  provinceCode: z.string().min(1),
  days: z.number().int().min(1).max(3),
});
export type GetLodgingOptionsRequest = z.infer<typeof GetLodgingOptionsRequestSchema>;

export const StartRetreatTripRequestSchema = z.object({
  provinceCode: z.string().min(1),
  days: z.number().int().min(1).max(3),
  lodgingType: TravelLodgingTypeSchema,
  lodgingOptionId: z.string().optional().nullable(),
  propertyId: IdSchema.optional().nullable(),
  propertySource: z.string().optional().nullable(),
});
export type StartRetreatTripRequest = z.infer<typeof StartRetreatTripRequestSchema>;

export const StartRetreatTripResponseSchema = z.object({
  ok: z.boolean(),
  trip: TravelTripDtoSchema,
  totalCost: MoneySchema,
  message: z.string(),
});
export type StartRetreatTripResponse = z.infer<typeof StartRetreatTripResponseSchema>;
