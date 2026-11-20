import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@efls/contracts';
import { env } from '../config/env';
import { getAdminAccessToken, subscribeAdminSession } from '../../features/auth/session';

export type AdminSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AdminSocket | null = null;
let unwatchSession: (() => void) | null = null;

function currentToken(): string | undefined {
  return getAdminAccessToken() ?? undefined;
}

/** Luôn gửi token mới nhất ở mỗi lần handshake/reconnect (tránh token cũ). */
function authPayload(cb: (data: { token?: string }) => void): void {
  cb({ token: currentToken() });
}

function watchSession(): void {
  if (unwatchSession) return;
  unwatchSession = subscribeAdminSession(() => {
    if (!socket) return;
    if (!currentToken()) {
      closeAdminSocket();
      return;
    }
    if (!socket.connected && !socket.active) socket.connect();
  });
}

export function getAdminSocket(): AdminSocket {
  if (socket) {
    if (!socket.active && !socket.connected) socket.connect();
    return socket;
  }

  socket = io(env.realtimeUrl || undefined, {
    // Trước đây chỉ dùng websocket + 10 lần thử => admin mất realtime vĩnh viễn
    // khi mạng/proxy chặn WS. Thêm polling fallback và reconnect vô hạn.
    transports: ['websocket', 'polling'],
    auth: authPayload,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    timeout: 20_000,
  });
  watchSession();
  return socket;
}

export function reconnectAdminSocket(): AdminSocket {
  closeAdminSocket();
  return getAdminSocket();
}

export function closeAdminSocket(): void {
  socket?.disconnect();
  socket = null;
}
