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
  'water',
  'park',
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
  'operating_without_license',
]);
export type CrimeType = z.infer<typeof CrimeTypeSchema>;

export const AiTaskSchema = z.enum(['judge', 'news', 'npc_negotiation', 'gm_economy']);
export type AiTask = z.infer<typeof AiTaskSchema>;

export const IndustryTypeSchema = z.enum([
  'Bất động sản',
  'Tài chính - Ngân hàng',
  'Công nghệ - Trí tuệ nhân tạo',
  'Công nghệ nông nghiệp',
  'Y tế - Dược phẩm',
  'Giải trí - Truyền thông',
  'Hậu cần',
  'Năng lượng - Khoáng sản',
  'Giáo dục',
  'Dịch vụ thế giới ngầm',
]);
export type IndustryType = z.infer<typeof IndustryTypeSchema>;
