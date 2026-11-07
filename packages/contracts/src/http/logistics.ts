import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

export const LogisticsNodeDtoSchema = z.object({
  id: IdSchema,
  name: z.string(),
  nodeType: z.enum(['seaport', 'hub']),
  capacity: z.number().int(),
});
export type LogisticsNodeDto = z.infer<typeof LogisticsNodeDtoSchema>;

export const ShipmentDtoSchema = z.object({
  id: IdSchema,
  companyId: IdSchema,
  originId: IdSchema,
  destinationId: IdSchema,
  cargo: z.string(),
  value: MoneySchema,
  status: z.enum(['pending', 'in_transit', 'arrived', 'seized']),
  departureAt: z.string().datetime(),
  arrivalAt: z.string().datetime(),
  duty: MoneySchema,
});
export type ShipmentDto = z.infer<typeof ShipmentDtoSchema>;

export const LogisticsOverviewDtoSchema = z.object({
  nodes: z.array(LogisticsNodeDtoSchema),
  shipments: z.array(ShipmentDtoSchema),
  myCompanies: z.array(z.object({ id: IdSchema, name: z.string() })),
});
export type LogisticsOverviewDto = z.infer<typeof LogisticsOverviewDtoSchema>;

export const CreateShipmentRequestSchema = z.object({
  companyId: IdSchema,
  originId: IdSchema,
  destinationId: IdSchema,
  cargo: z.string().min(2).max(60),
  value: MoneySchema,
  declareValue: MoneySchema,
});
export type CreateShipmentRequest = z.infer<typeof CreateShipmentRequestSchema>;
