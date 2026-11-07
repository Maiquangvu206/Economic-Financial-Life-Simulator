import { createServer, type Server as HttpServer } from 'node:http';
import express from 'express';
import { Server } from 'socket.io';
import {
  ChatSendPayloadSchema,
  CourtStatementPayloadSchema,
  JoinRoomPayloadSchema,
  PlayerMovePayloadSchema,
  Rooms,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@efls/contracts';
import { authenticateSocket } from './auth.js';
import { env } from './config/env.js';
import { logger } from './logger.js';
import { canJoinRoom } from './rooms.js';
import type { SocketActor } from './types.js';

// socket.io does not export DefaultEventsMap from its public entry point.
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
    void socket.join(Rooms.character(actor.id));
    logger.debug({ characterId: actor.id }, 'socket connected');

    socket.on('room:join', (payload) => {
      const parsed = JoinRoomPayloadSchema.safeParse(payload);
      if (!parsed.success) return;
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
        characterIds: [actor.id],
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
            characterId: actor.id,
            x: parsed.data.x,
            y: parsed.data.y,
            at: Date.now(),
          });
        }
      }
    });

    socket.on('chat:send', (payload) => {
      const parsed = ChatSendPayloadSchema.safeParse(payload);
      if (!parsed.success || !allowChat(socket.id)) return;

      const room = Rooms.chat(parsed.data.channelId);
      io.to(room).emit('chat:message', {
        channelId: parsed.data.channelId,
        characterId: actor.id,
        // TODO: resolve display name from a cached character projection.
        displayName: 'Người chơi',
        message: parsed.data.message,
        at: Date.now(),
      });
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
      logger.debug({ characterId: actor.id }, 'socket disconnected');
    });
  });

  const close = async (): Promise<void> => {
    await io.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { httpServer, io, close };
}
