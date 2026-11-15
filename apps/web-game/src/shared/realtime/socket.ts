import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@efls/contracts';
import { env } from '../config/env';
import { useSessionStore } from '../../features/auth/sessionStore';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

function currentToken(): string | undefined {
  return useSessionStore.getState().accessToken ?? undefined;
}

export function getGameSocket(): GameSocket {
  const token = currentToken();

  if (socket) {
    const prev = (socket.auth as { token?: string } | undefined)?.token;
    if (prev !== token) {
      socket.disconnect();
      socket = null;
    } else if (socket.connected) {
      return socket;
    } else {
      // allow reconnect attempt with same token/socket instance
      socket.auth = { token };
      if (!socket.active) socket.connect();
      return socket;
    }
  }

  socket = io(env.realtimeUrl, {
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function reconnectGameSocket(): GameSocket {
  closeGameSocket();
  return getGameSocket();
}

export function closeGameSocket(): void {
  socket?.disconnect();
  socket = null;
}
