import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@efls/contracts';
import { env } from '../config/env';
import { useSessionStore } from '../../features/auth/sessionStore';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;

export function getGameSocket(): GameSocket {
  if (socket?.connected) return socket;

  socket?.disconnect();
  socket = io(env.realtimeUrl, {
    transports: ['websocket'],
    auth: { token: useSessionStore.getState().accessToken },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function closeGameSocket(): void {
  socket?.disconnect();
  socket = null;
}
