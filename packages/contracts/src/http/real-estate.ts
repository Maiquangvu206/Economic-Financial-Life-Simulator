import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';
import { ZoneTypeSchema } from '../enums/index.js';

export const PropertyTypeSchema = z.enum([
  'apartment',
  'house',
  'office',
  'warehouse',
  'port_berth',
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const PropertyStatusSchema = z.enum(['unowned', 'owned', 'listed', 'auction']);
export type PropertyStatus = z.infer<typeof PropertyStatusSchema>;

export const PropertyDtoSchema = z.object({
  id: IdSchema,
  nodeId: IdSchema,
  name: z.string(),
  location: z.object({ x: z.number().int(), y: z.number().int() }),
  zoneType: ZoneTypeSchema,
  propertyType: PropertyTypeSchema,
  purchasePrice: MoneySchema,
  currentValue: MoneySchema,
  monthlyRent: MoneySchema,
  askingPrice: MoneySchema.nullable(),
  status: PropertyStatusSchema,
  ownerCharacterId: IdSchema.nullable(),
  ownerCompanyId: IdSchema.nullable(),
  isMine: z.boolean(),
  leasedByMe: z.boolean(),
});
export type PropertyDto = z.infer<typeof PropertyDtoSchema>;

export const RealEstateOverviewDtoSchema = z.object({
  properties: z.array(PropertyDtoSchema),
  ownedCount: z.number().int(),
  portfolioValue: MoneySchema,
  monthlyRentIncome: MoneySchema,
});
export type RealEstateOverviewDto = z.infer<typeof RealEstateOverviewDtoSchema>;

export const BuyPropertyRequestSchema = z.object({ propertyId: IdSchema });
export type BuyPropertyRequest = z.infer<typeof BuyPropertyRequestSchema>;

export const ListPropertyRequestSchema = z.object({ askingPrice: MoneySchema });
export type ListPropertyRequest = z.infer<typeof ListPropertyRequestSchema>;

export const RentPropertyRequestSchema = z.object({ propertyId: IdSchema });
export type RentPropertyRequest = z.infer<typeof RentPropertyRequestSchema>;
