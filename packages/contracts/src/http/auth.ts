import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { UserRoleSchema } from '../enums/index.js';

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(80).optional(),
  birthplaceCode: z.string().length(3).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const SessionUserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  username: z.string(),
  role: UserRoleSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number().int().positive(),
  user: SessionUserSchema,
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

/**
 * Single sign-on handoff: the portal exchanges a freshly issued refresh token
 * for a short-lived, one-time code, then redirects the browser to the
 * destination app which exchanges that code for its own session.
 */
export const SsoHandoffRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type SsoHandoffRequest = z.infer<typeof SsoHandoffRequestSchema>;

export const SsoHandoffResponseSchema = z.object({
  code: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
});
export type SsoHandoffResponse = z.infer<typeof SsoHandoffResponseSchema>;

export const SsoExchangeRequestSchema = z.object({
  code: z.string().min(1),
});
export type SsoExchangeRequest = z.infer<typeof SsoExchangeRequestSchema>;
