import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

/** Client -> server events. Payloads are validated server-side. */
export const JoinRoomPayloadSchema = z.object({
  room: z.string().min(1).max(120),
});
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

export const ChatSendPayloadSchema = z.object({
  channelId: IdSchema,
  message: z.string().min(1).max(1000),
});
export type ChatSendPayload = z.infer<typeof ChatSendPayloadSchema>;

export const PlayerMovePayloadSchema = z.object({
  x: z.number().int().min(0).max(10_000),
  y: z.number().int().min(0).max(10_000),
});
export type PlayerMovePayload = z.infer<typeof PlayerMovePayloadSchema>;

export const CourtStatementPayloadSchema = z.object({
  caseId: IdSchema,
  statement: z.string().min(1).max(4000),
});
export type CourtStatementPayload = z.infer<typeof CourtStatementPayloadSchema>;

export interface ServerToClientEvents {
  'presence:sync': (payload: { room: string; characterIds: string[] }) => void;
  'player:moved': (payload: { characterId: string; x: number; y: number; at: number }) => void;
  'chat:message': (payload: {
    channelId: string;
    characterId: string;
    displayName: string;
    message: string;
    at: number;
  }) => void;
  'market:tick': (payload: {
    tickerId: string;
    price: { amount: number; currency: 'USD' };
    changePct: number;
    at: number;
  }) => void;
  'orderbook:update': (payload: {
    tickerId: string;
    bids: Array<{ price: number; amount: number }>;
    asks: Array<{ price: number; amount: number }>;
  }) => void;
  'court:verdict': (payload: {
    caseId: string;
    verdict: 'guilty' | 'not_guilty' | 'settlement';
    at: number;
  }) => void;
  notification: (payload: {
    kind: 'info' | 'warning' | 'danger' | 'success';
    title: string;
    body: string;
    at: number;
  }) => void;
  'macro:snapshot': (payload: {
    inflationPct: number;
    cpi: number;
    moneySupply: { amount: number; currency: 'USD' };
    at: number;
  }) => void;
}

export interface ClientToServerEvents {
  'room:join': (payload: { room: string }) => void;
  'room:leave': (payload: { room: string }) => void;
  'player:move': (payload: { x: number; y: number }) => void;
  'chat:send': (payload: { channelId: string; message: string }) => void;
  'court:statement': (payload: { caseId: string; statement: string }) => void;
  'market:subscribe': (payload: { tickerId: string }) => void;
  'market:unsubscribe': (payload: { tickerId: string }) => void;
}

/** Realtime DTO used by the market room. */
export const MarketTickSchema = z.object({
  tickerId: IdSchema,
  price: MoneySchema,
  changePct: z.number(),
  at: z.number().int(),
});
export type MarketTick = z.infer<typeof MarketTickSchema>;
