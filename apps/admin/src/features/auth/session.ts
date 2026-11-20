import type { SessionUser } from '@efls/contracts';
import { useSyncExternalStore } from 'react';

export interface AdminSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

const STORAGE_KEY = 'efls.admin.session';
const ADMIN_ROLES: SessionUser['role'][] = ['admin', 'moderator'];

function isAdminSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AdminSession>;
  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidate.refreshToken === 'string' &&
    Boolean(candidate.user) &&
    typeof candidate.user?.email === 'string' &&
    typeof candidate.user?.role === 'string'
  );
}

function readStoredSession(): AdminSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isAdminSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type AuthSyncMessage =
  | { type: 'session'; payload: AdminSession }
  | { type: 'clear' };

const authChannel: BroadcastChannel | null =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('efls_auth_sync')
    : null;

let current: AdminSession | null = readStoredSession();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getAdminSession(): AdminSession | null {
  return current;
}

export function getAdminAccessToken(): string | null {
  return current?.accessToken ?? null;
}

export function setAdminSession(session: AdminSession, opts?: { broadcast?: boolean }): void {
  current = session;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* localStorage có thể bị chặn; phiên vẫn dùng được trong bộ nhớ. */
  }
  emit();
  if (opts?.broadcast !== false) {
    try { authChannel?.postMessage({ type: 'session', payload: session } satisfies AuthSyncMessage); } catch { /* ignore */ }
  }
}

export function clearAdminSession(opts?: { broadcast?: boolean }): void {
  current = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit();
  if (opts?.broadcast !== false) {
    try { authChannel?.postMessage({ type: 'clear' } satisfies AuthSyncMessage); } catch { /* ignore */ }
  }
}

// Đồng bộ phiên admin (đăng xuất/khóa/refresh token) giữa các tab
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    try {
      if (!e.newValue) {
        if (current) { current = null; emit(); }
        return;
      }
      const parsed: unknown = JSON.parse(e.newValue);
      if (isAdminSession(parsed)) {
        current = parsed;
        emit();
      }
    } catch { /* ignore */ }
  });
  authChannel?.addEventListener('message', (e: MessageEvent<AuthSyncMessage>) => {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'session' && isAdminSession(msg.payload)) {
      const next = msg.payload as AdminSession;
      // tránh loop ghi đè không cần thiết
      if (JSON.stringify(current) !== JSON.stringify(next)) {
        current = next;
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        emit();
      }
    } else if (msg.type === 'clear') {
      if (current) {
        current = null;
        try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
        emit();
      }
    }
  });
}

export function hasAdminAccess(role: SessionUser['role'] | undefined): boolean {
  return role !== undefined && ADMIN_ROLES.includes(role);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cho phép các module ngoài React (vd: socket realtime) theo dõi token mới. */
export function subscribeAdminSession(listener: () => void): () => void {
  return subscribe(listener);
}

export function useAdminSession(): AdminSession | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
