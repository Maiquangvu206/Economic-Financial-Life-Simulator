import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import {
  ChatGlobalSendSchema,
  ChatPrivateSendSchema,
  CourtStatementPayloadSchema,
  JoinRoomPayloadSchema,
  PlayerMovePayloadSchema,
  Rooms,
  type ChatAck,
  type ChatMessage,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@efls/contracts';
import { authenticateSocket } from './auth.js';
import { env } from './config/env.js';
import { pool } from './db.js';
import { logger } from './logger.js';
import { canJoinRoom } from './rooms.js';
import type { SocketActor } from './types.js';

type DefaultEventsMap = Record<string, (...args: never[]) => void>;

interface SocketData {
  actor: SocketActor;
}

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

type RoomTarget = {
  join: (room: string) => void | Promise<void>;
  leave: (room: string) => void | Promise<void>;
};

/**
 * socket.join/leave có thể trả Promise (nhất là khi dùng Redis adapter).
 * Nuốt lỗi có log để một lần join thất bại không tạo unhandled rejection
 * (Node 24 mặc định coi đó là lỗi nghiêm trọng và thoát process).
 */
function safeJoin(target: RoomTarget, room: string): void {
  void Promise.resolve(target.join(room)).catch((err) => {
    logger.warn({ err, room }, 'socket join failed');
  });
}

function safeLeave(target: RoomTarget, room: string): void {
  void Promise.resolve(target.leave(room)).catch((err) => {
    logger.warn({ err, room }, 'socket leave failed');
  });
}

const chatWindows = new Map<string, number[]>();
// Đồng bộ presence theo Set<socketId> gắn với từng userId:
// chỉ chuyển Offline khi socketIds.size === 0 (đóng tab/phiên cuối cùng).
const onlineSocketsByUser = new Map<string, Set<string>>();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function allowChat(socketId: string): boolean {
  const now = Date.now();
  const cutoff = now - 3_000;
  const recent = (chatWindows.get(socketId) ?? []).filter((at) => at > cutoff);
  if (recent.length >= 5) {
    chatWindows.set(socketId, recent);
    return false;
  }
  recent.push(now);
  chatWindows.set(socketId, recent);
  return true;
}

function markOnline(userId: string, socketId: string): boolean {
  let sockets = onlineSocketsByUser.get(userId);
  if (!sockets) {
    sockets = new Set<string>();
    onlineSocketsByUser.set(userId, sockets);
  }
  sockets.add(socketId);
  return sockets.size === 1;
}
function markOffline(userId: string, socketId: string): boolean {
  const sockets = onlineSocketsByUser.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size === 0) {
    onlineSocketsByUser.delete(userId);
    return true;
  }
  return false;
}
function getOnlineUserIds(): string[] {
  return Array.from(onlineSocketsByUser.keys());
}

async function persistMessage(msg: ChatMessage): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO chat_messages (id, client_msg_id, channel, sender_user_id, sender_character_id, sender_name, sender_role, receiver_user_id, content, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)
       ON CONFLICT (id) DO NOTHING`,
      [
        msg.id,
        msg.clientMsgId ?? null,
        msg.channel,
        msg.senderId,
        null,
        msg.senderName,
        msg.senderRole,
        msg.receiverId ?? null,
        msg.content,
        msg.createdAt,
      ],
    );
  } catch (err) {
    logger.warn({ err }, 'Failed to persist chat message');
  }
}

function ackOf(ok: true, data: { id: string; clientMsgId?: string; createdAt: string }): ChatAck;
function ackOf(ok: false, error: string, clientMsgId?: string): ChatAck;
function ackOf(ok: boolean, b: any, c?: any): ChatAck {
  if (ok) return { ok: true, ...(b as object) } as ChatAck;
  return { ok: false, error: b as string, ...(c ? { clientMsgId: c } : {}) };
}

export function createRealtimeServer(): {
  httpServer: HttpServer;
  io: GameServer;
  close: () => Promise<void>;
} {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'realtime' });
  });

  const httpServer = createServer(app);
  // Giữ kết nối đủ lâu cho long-polling/WebSocket; header timeout chặn client treo.
  httpServer.headersTimeout = 20_000;
  httpServer.keepAliveTimeout = 65_000;
  const io: GameServer = new Server(httpServer, {
    cors: {
      origin: [env.WEB_ORIGIN, env.ADMIN_ORIGIN],
      credentials: true,
    },
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 64 * 1024,
  });

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const actor = socket.data.actor;
    const userRoom = `user:${actor.userId}`;
    safeJoin(socket, userRoom);
    safeJoin(socket, Rooms.character(actor.userId));
    // Presence: chỉ broadcast online khi chuyển từ 0 -> 1 socket
    if (markOnline(actor.userId, socket.id)) {
      (io.emit as any)('user:presence', { userId: actor.userId, isOnline: true });
    }
    // Gửi snapshot online hiện tại cho client vừa kết nối
    socket.emit('presence:sync', { room: '__online_users__', characterIds: getOnlineUserIds() });
    logger.debug({ userId: actor.userId }, 'socket connected');

    socket.on('room:join', (payload) => {
      const parsed = JoinRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      // allow joining own user room explicitly
      if (parsed.data.room === userRoom || parsed.data.room === Rooms.character(actor.userId)) {
        safeJoin(socket, parsed.data.room);
        return;
      }
      if (parsed.data.room === '__presence__') {
        socket.emit('presence:sync', { room: '__online_users__', characterIds: getOnlineUserIds() });
        return;
      }
      if (!canJoinRoom(actor, parsed.data.room)) {
        socket.emit('notification', {
          kind: 'danger',
          title: 'Không có quyền',
          body: 'Bạn không thể tham gia kênh này.',
          at: Date.now(),
        });
        return;
      }
      safeJoin(socket, parsed.data.room);
      socket.emit('presence:sync', {
        room: parsed.data.room,
        characterIds: [actor.userId],
      });
    });

    socket.on('room:leave', (payload) => {
      if (typeof payload?.room === 'string') {
        safeLeave(socket, payload.room);
      }
    });

    socket.on('player:move', (payload) => {
      const parsed = PlayerMovePayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      for (const room of socket.rooms) {
        if (room.startsWith('city_map_room:')) {
          socket.to(room).emit('player:moved', {
            characterId: actor.userId,
            x: parsed.data.x,
            y: parsed.data.y,
            at: Date.now(),
          });
        }
      }
    });

    // New: chat:global
    socket.on('chat:global', async (payload, ackCb) => {
      const parsed = ChatGlobalSendSchema.safeParse(payload);
      if (!parsed.success) {
        ackCb?.(ackOf(false, 'Nội dung không hợp lệ', (payload as any)?.clientMsgId));
        return;
      }
      if (!allowChat(socket.id)) {
        socket.emit('chat:rate_limited', { message: 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' });
        ackCb?.(ackOf(false, 'rate_limited', parsed.data.clientMsgId));
        return;
      }
      try {
        const msg: ChatMessage = {
          id: randomUUID(),
          clientMsgId: parsed.data.clientMsgId,
          channel: 'global',
          senderId: actor.userId,
          senderName: actor.displayName,
          senderRole: actor.role,
          receiverId: null,
          content: parsed.data.content.trim(),
          createdAt: new Date().toISOString(),
        };
        await persistMessage(msg);
        // phát tới phòng chat tổng
        io.to(Rooms.chat('global')).emit('chat:global', msg);
        // legacy compatibility
        io.to(Rooms.chat('global')).emit('chat:message', {
          channelId: 'global',
          characterId: actor.userId,
          displayName: actor.displayName,
          message: msg.content,
          at: Date.parse(msg.createdAt),
          clientMsgId: msg.clientMsgId,
        });
        ackCb?.(ackOf(true, { id: msg.id, clientMsgId: msg.clientMsgId, createdAt: msg.createdAt }));
      } catch (err) {
        console.error('[realtime] chat:global failed', err);
        ackCb?.(ackOf(false, 'Không gửi được tin nhắn. Vui lòng thử lại.', parsed.data.clientMsgId));
      }
    });

    // New: chat:private
    socket.on('chat:private', async (payload, ackCb) => {
      const parsed = ChatPrivateSendSchema.safeParse(payload);
      if (!parsed.success) {
        ackCb?.(ackOf(false, 'Nội dung không hợp lệ', (payload as any)?.clientMsgId));
        return;
      }
      const receiverId = String((parsed.data as any).receiverUserId || parsed.data.receiverId || '').trim();
      const { content, clientMsgId } = parsed.data;
      if (!UUID_RE.test(receiverId) || receiverId === actor.userId) {
        ackCb?.(ackOf(false, 'Người nhận không hợp lệ', clientMsgId));
        return;
      }
      if (!allowChat(socket.id)) {
        socket.emit('chat:rate_limited', { message: 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' });
        ackCb?.(ackOf(false, 'rate_limited', clientMsgId));
        return;
      }
      try {
        const msg: ChatMessage = {
          id: randomUUID(),
          clientMsgId,
          channel: 'private',
          senderId: actor.userId,
          senderName: actor.displayName,
          senderRole: actor.role,
          receiverId,
          content: content.trim(),
          createdAt: new Date().toISOString(),
        };
        await persistMessage(msg);
        // Emit tới CẢ 2 room user: người nhận và người gửi (đồng bộ mọi tab/thiết bị, realtime tức thì)
        io.to(`user:${receiverId}`).to(`user:${actor.userId}`).to(Rooms.character(receiverId)).to(Rooms.character(actor.userId)).emit('chat:private', msg);
        // legacy compatibility
        io.to(`user:${receiverId}`).to(`user:${actor.userId}`).to(Rooms.character(receiverId)).to(Rooms.character(actor.userId)).emit('chat:message', {
          channelId: `private:${receiverId}`,
          characterId: actor.userId,
          displayName: actor.displayName,
          message: msg.content,
          at: Date.parse(msg.createdAt),
          toCharacterId: receiverId,
          fromPrivate: true,
          clientMsgId: msg.clientMsgId,
        });
        // ACK/xác nhận lại cho người gửi (kèm clientMsgId để đối chiếu)
        ackCb?.(ackOf(true, { id: msg.id, clientMsgId: msg.clientMsgId, createdAt: msg.createdAt }));
      } catch (err) {
        console.error('[realtime] chat:private failed', err);
        ackCb?.(ackOf(false, 'Không gửi được tin nhắn. Vui lòng thử lại.', clientMsgId));
      }
    });

    // Legacy: chat:send
    socket.on('chat:send', async (payload, ackCb) => {
      try {
        const { channelId, message, clientMsgId } = payload || ({} as any);
        if (typeof channelId !== 'string' || typeof message !== 'string' || !message.trim()) {
          ackCb?.(ackOf(false, 'invalid'));
          return;
        }
        if (channelId.startsWith('private:')) {
          const receiverId = channelId.slice('private:'.length);
          if (!UUID_RE.test(receiverId) || receiverId === actor.userId) { ackCb?.(ackOf(false, 'invalid')); return; }
          if (!allowChat(socket.id)) { socket.emit('chat:rate_limited', { message: 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' }); ackCb?.(ackOf(false, 'rate_limited', clientMsgId)); return; }
          const msg: ChatMessage = { id: randomUUID(), clientMsgId, channel: 'private', senderId: actor.userId, senderName: actor.displayName, senderRole: actor.role, receiverId, content: message.trim(), createdAt: new Date().toISOString() };
          await persistMessage(msg);
          io.to(`user:${receiverId}`).to(Rooms.character(receiverId)).emit('chat:private', msg);
          io.to(`user:${receiverId}`).to(`user:${actor.userId}`).to(Rooms.character(receiverId)).to(Rooms.character(actor.userId)).emit('chat:message', { channelId, characterId: actor.userId, displayName: actor.displayName, message: msg.content, at: Date.parse(msg.createdAt), toCharacterId: receiverId, fromPrivate: true, clientMsgId });
          ackCb?.(ackOf(true, { id: msg.id, clientMsgId: msg.clientMsgId, createdAt: msg.createdAt }));
          return;
        }
        // public/global
        if (!allowChat(socket.id)) { socket.emit('chat:rate_limited', { message: 'Bạn đang gửi quá nhanh. Vui lòng chờ một chút.' }); ackCb?.(ackOf(false, 'rate_limited', clientMsgId)); return; }
        const msg: ChatMessage = { id: randomUUID(), clientMsgId, channel: 'global', senderId: actor.userId, senderName: actor.displayName, senderRole: actor.role, receiverId: null, content: message.trim(), createdAt: new Date().toISOString() };
        await persistMessage(msg);
        io.to(Rooms.chat(channelId)).emit('chat:global', msg);
        io.to(Rooms.chat(channelId)).emit('chat:message', { channelId, characterId: actor.userId, displayName: actor.displayName, message: msg.content, at: Date.parse(msg.createdAt), clientMsgId });
        ackCb?.(ackOf(true, { id: msg.id, clientMsgId: msg.clientMsgId, createdAt: msg.createdAt }));
      } catch (err) {
        console.error('[realtime] chat:send failed', err);
        ackCb?.(ackOf(false, 'Không gửi được tin nhắn. Vui lòng thử lại.', (payload as any)?.clientMsgId));
      }
    });

    socket.on('court:statement', (payload) => {
      const parsed = CourtStatementPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      socket.to(Rooms.courtroom(parsed.data.caseId)).emit('notification', {
        kind: 'info',
        title: 'Lời khai mới',
        body: 'Một lời khai vừa được gửi tới phiên tòa.',
        at: Date.now(),
      });
    });

    socket.on('market:subscribe', (payload) => {
      if (typeof payload?.tickerId === 'string') {
        safeJoin(socket, Rooms.ticker(payload.tickerId));
      }
    });

    socket.on('market:unsubscribe', (payload) => {
      if (typeof payload?.tickerId === 'string') {
        safeLeave(socket, Rooms.ticker(payload.tickerId));
      }
    });

    socket.on('disconnect', () => {
      chatWindows.delete(socket.id);
      if (markOffline(actor.userId, socket.id)) {
        (io.emit as any)('user:presence', { userId: actor.userId, isOnline: false });
      }
      logger.debug({ userId: actor.userId }, 'socket disconnected');
    });
  });

  const close = async (): Promise<void> => {
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { httpServer, io, close };
}

