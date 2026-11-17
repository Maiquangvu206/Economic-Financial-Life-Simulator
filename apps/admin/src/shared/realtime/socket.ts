import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@efls/contracts';
import { env } from '../config/env';
import { getAdminAccessToken } from '../../features/auth/session';

export type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AdminSocket | null = null;

export function getAdminSocket(): AdminSocket {
  const token = getAdminAccessToken() ?? undefined;

  if (socket) {
    const prev = (socket.auth as { token?: string } | undefined)?.token;
    if (prev !== token) {
      socket.disconnect();
      socket = null;
    } else if (socket.connected) {
      return socket;
    } else {
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

export function closeAdminSocket(): void {
  socket?.disconnect();
  socket = null;
}