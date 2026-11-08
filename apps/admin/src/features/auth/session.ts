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

export function setAdminSession(session: AdminSession): void {
  current = session;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* localStorage có thể bị chặn; phiên vẫn dùng được trong bộ nhớ. */
  }
  emit();
}

export function clearAdminSession(): void {
  current = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function hasAdminAccess(role: SessionUser['role'] | undefined): boolean {
  return role !== undefined && ADMIN_ROLES.includes(role);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAdminSession(): AdminSession | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
}
