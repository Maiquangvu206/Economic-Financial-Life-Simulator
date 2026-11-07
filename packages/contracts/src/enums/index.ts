import { z } from 'zod';

export const UserRoleSchema = z.enum(['player', 'moderator', 'admin']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const ZoneTypeSchema = z.enum([
  'residential',
  'commercial',
  'industrial',
  'civic',
  'port',
  'slum',
]);
export type ZoneType = z.infer<typeof ZoneTypeSchema>;

export const OrderSideSchema = z.enum(['buy', 'sell']);
export type OrderSide = z.infer<typeof OrderSideSchema>;

export const OrderStatusSchema = z.enum(['open', 'partially_filled', 'filled', 'cancelled']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const LoanStatusSchema = z.enum(['active', 'grace', 'defaulted', 'foreclosed', 'repaid']);
export type LoanStatus = z.infer<typeof LoanStatusSchema>;

export const CrimeTypeSchema = z.enum([
  'tax_evasion',
  'money_laundering',
  'fraud',
  'forgery',
  'blackmail',
  'heist',
  'sabotage',
  'assault',
]);
export type CrimeType = z.infer<typeof CrimeTypeSchema>;

export const AiTaskSchema = z.enum(['judge', 'news', 'npc_negotiation', 'gm_economy']);
export type AiTask = z.infer<typeof AiTaskSchema>;

export const IndustryTypeSchema = z.enum([
  'real_estate',
  'finance_banking',
  'technology_ai',
  'agritech',
  'healthcare_pharma',
  'entertainment_media',
  'logistics',
  'energy_mining',
  'education',
  'underworld_services',
]);
export type IndustryType = z.infer<typeof IndustryTypeSchema>;
