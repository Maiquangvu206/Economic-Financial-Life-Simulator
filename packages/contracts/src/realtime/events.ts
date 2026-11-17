import { z } from 'zod';
import { IdSchema } from '../common/ids.js';
import { MoneySchema } from '../common/money.js';

/** Client -> server events. Payloads are validated server-side. */
export const JoinRoomPayloadSchema = z.object({
  room: z.string().min(1).max(120),
});
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;

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

/** Tin nhắn chat đồng bộ cho global & private. */
export const ChatMessageSchema = z.object({
  id: z.string(),
  clientMsgId: z.string().max(120).optional(),
  channel: z.enum(['global', 'private']),
  senderId: z.string(), // userId của người gửi
  senderName: z.string(),
  senderRole: z.string(),
  receiverId: z.string().nullable().optional(),
  content: z.string().min(1).max(1000),
  createdAt: z.string(), // ISO
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatGlobalSendSchema = z.object({
  content: z.string().min(1).max(1000),
  clientMsgId: z.string().max(120).optional(),
});
export const ChatPrivateSendSchema = z.object({
  receiverId: z.string().min(1).optional(), // userId người nhận (tương thích cũ)
  receiverUserId: z.string().min(1).optional(), // userId người nhận (chuẩn)
  content: z.string().min(1).max(1000),
  clientMsgId: z.string().max(120).optional(),
}).refine((v) => !!(v.receiverId || v.receiverUserId), { message: 'receiverId required' });

export type ChatAck =
  | { ok: true; id: string; clientMsgId?: string; createdAt: string }
  | { ok: false; error: string; clientMsgId?: string };

// Legacy aliases (kept for gradual migration; prefer chat:global/chat:private)
export const ChatSendPayloadSchema = z.object({
  channelId: z.string().min(1).max(120),
  message: z.string().min(1).max(1000),
  displayName: z.string().trim().min(1).max(80).optional(),
  clientMsgId: z.string().max(120).optional(),
});
export type ChatSendPayload = z.infer<typeof ChatSendPayloadSchema>;

export interface ServerToClientEvents {
  'presence:sync': (payload: { room: string; characterIds: string[] }) => void;
  'user:presence': (payload: { userId: string; isOnline: boolean }) => void;
  'player:moved': (payload: { characterId: string; x: number; y: number; at: number }) => void;
  'election:votes': (payload: {
    electionId: string;
    candidateId: string;
    votes: number;
    at: number;
  }) => void;
  'chat:global': (payload: ChatMessage) => void;
  'chat:private': (payload: ChatMessage) => void;
  /** @deprecated use chat:global/chat:private */
  'chat:message': (payload: {
    channelId: string;
    characterId: string;
    displayName: string;
    message: string;
    at: number;
    toCharacterId?: string;
    fromPrivate?: boolean;
    clientMsgId?: string;
  }) => void;
  'chat:rate_limited': (payload: { message: string }) => void;
  'market:tick': (payload: {
    tickerId: string;
    price: { amount: number; currency: 'VND' };
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
    moneySupply: { amount: number; currency: 'VND' };
    at: number;
  }) => void;
  'game:time': (payload: {
    currentDay?: number;
    dayOfYear?: number;
    currentYear?: number;
    currentMonth?: number;
    currentDayOfMonth?: number;
    season?: string;
    period?: string;
    hour?: number;
    minute?: number;
    tick?: number;
    at?: string;
    tickUpdatedAt?: string;
    standard?: string;
  }) => void;
}

export interface ClientToServerEvents {
  'room:join': (payload: { room: string }) => void;
  'room:leave': (payload: { room: string }) => void;
  'player:move': (payload: { x: number; y: number }) => void;
  'chat:global': (payload: z.infer<typeof ChatGlobalSendSchema>, ack?: (res: ChatAck) => void) => void;
  'chat:private': (payload: z.infer<typeof ChatPrivateSendSchema>, ack?: (res: ChatAck) => void) => void;
  /** @deprecated use chat:global/chat:private */
  'chat:send': (payload: { channelId: string; message: string; displayName?: string; clientMsgId?: string }, ack?: (res: ChatAck) => void) => void;
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
