import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@efls/contracts';
import { env } from '../config/env';
import { useSessionStore } from '../../features/auth/sessionStore';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: GameSocket | null = null;
let unwatchSession: (() => void) | null = null;

function currentToken(): string | undefined {
  return useSessionStore.getState().accessToken ?? undefined;
}

/**
 * Token được đọc lại ở MỖI lần handshake/reconnect.
 *
 * Trước đây `auth` là object chụp token tại thời điểm tạo socket. Khi access
 * token hết hạn (15 phút) mà socket đang reconnect, nó gửi token cũ và bị
 * server từ chối mãi. Dùng callback để luôn gửi token mới nhất.
 */
function authPayload(cb: (data: { token?: string }) => void): void {
  cb({ token: currentToken() });
}

function watchSession(): void {
  if (unwatchSession) return;
  unwatchSession = useSessionStore.subscribe((state, prev) => {
    if (state.accessToken === prev.accessToken) return;
    if (!socket) return;
    if (!state.accessToken) {
      // Đăng xuất: đóng socket để không giữ phiên cũ.
      closeGameSocket();
      return;
    }
    // Có token mới: nếu đang mất kết nối, lần thử tiếp theo sẽ dùng token mới
    // nhờ auth callback. Nếu đang kết nối thì không cần ngắt (tránh nháy presence).
    if (!socket.connected && !socket.active) socket.connect();
  });
}

export function getGameSocket(): GameSocket {
  if (socket) {
    if (!socket.active && !socket.connected) socket.connect();
    return socket;
  }

  socket = io(env.realtimeUrl || undefined, {
    transports: ['websocket', 'polling'],
    auth: authPayload,
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });
  watchSession();
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
