import { z } from 'zod';

/**
 * Money is ALWAYS stored and transported as an integer amount of minor units
 * (cents) plus a currency. Never use floats for money.
 *
 * `1_000_00` => 1,000.00 USD.
 */
export const CurrencySchema = z.enum(['USD', 'VND']);
export type Currency = z.infer<typeof CurrencySchema>;

export const MoneySchema = z.object({
  amount: z.number().int(),
  currency: CurrencySchema,
});
export type Money = z.infer<typeof MoneySchema>;

/** Finance coefficients are decimal strings to avoid binary float drift. */
export const DecimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected a decimal string');
export type DecimalString = z.infer<typeof DecimalStringSchema>;

export const PercentageSchema = z.number().min(0).max(100);
export const RatioSchema = z.number().min(0).max(1);
