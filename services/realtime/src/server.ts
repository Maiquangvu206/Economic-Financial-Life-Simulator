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

const chatWindows = new Map<string, number[]>();
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
    void socket.join(userRoom);
    void socket.join(Rooms.character(actor.userId));
    logger.debug({ userId: actor.userId }, 'socket connected');

    socket.on('room:join', (payload) => {
      const parsed = JoinRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
      // allow joining own user room explicitly
      if (parsed.data.room === userRoom || parsed.data.room === Rooms.character(actor.userId)) {
        void socket.join(parsed.data.room);
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
      void socket.join(parsed.data.room);
      socket.emit('presence:sync', {
        room: parsed.data.room,
        characterIds: [actor.userId],
      });
    });

    socket.on('room:leave', (payload) => {
      if (typeof payload?.room === 'string') {
        void socket.leave(payload.room);
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
      const { receiverId, content, clientMsgId } = parsed.data;
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
        // Chỉ emit tới room của người nhận (và tương thích room cũ)
        io.to(`user:${receiverId}`).to(Rooms.character(receiverId)).emit('chat:private', msg);
        // legacy compatibility cho người nhận
        io.to(`user:${receiverId}`).to(Rooms.character(receiverId)).emit('chat:message', {
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
          io.to(`user:${receiverId}`).to(Rooms.character(receiverId)).emit('chat:message', { channelId, characterId: actor.userId, displayName: actor.displayName, message: msg.content, at: Date.parse(msg.createdAt), toCharacterId: receiverId, fromPrivate: true, clientMsgId });
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
        void socket.join(Rooms.ticker(payload.tickerId));
      }
    });

    socket.on('market:unsubscribe', (payload) => {
      if (typeof payload?.tickerId === 'string') {
        void socket.leave(Rooms.ticker(payload.tickerId));
      }
    });

    socket.on('disconnect', () => {
      chatWindows.delete(socket.id);
      logger.debug({ userId: actor.userId }, 'socket disconnected');
    });
  });

  const close = async (): Promise<void> => {
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { httpServer, io, close };
}
