import type { ProblemDetails } from '@efls/contracts';
import { env } from '../config/env';
import { useSessionStore } from '../../features/auth/sessionStore';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;

  constructor(status: number, problem: ProblemDetails | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
  }
}

async function readProblem(response: Response): Promise<ProblemDetails | null> {
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return null;
  }
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refreshToken, setSession, clearSession } = useSessionStore.getState();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${env.apiBaseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // Chỉ đăng xuất nếu phiên hiện tại vẫn dùng refresh token này (tránh đăng xuất oan khi có luồng làm mới khác thành công).
        const current = useSessionStore.getState().refreshToken;
        if (current === refreshToken) clearSession();
        return null;
      }

      const data = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        expiresInSeconds: number;
        user: NonNullable<ReturnType<typeof useSessionStore.getState>['user']>;
      };
      setSession(data);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Tránh 304/ETag conditional GET làm fetch trả body rỗng và client coi là lỗi.
  return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers, cache: 'no-store' });
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = useSessionStore.getState().accessToken;
  let response = await send(path, init, token);

  // Access token hết hạn (15 phút): thử refresh một lần rồi gửi lại request.
  if (response.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) {
      response = await send(path, init, token);
    }
  }

  if (response.status === 401) {
    // Chỉ đăng xuất khi thực sự không còn phiên hợp lệ (tránh đăng xuất oan do nhiều request đồng thời).
    const latest = useSessionStore.getState().accessToken;
    if (!latest || latest === token) {
      useSessionStore.getState().clearSession();
    }
  }

  // 304 Not Modified: coi như cache-hit, không có body để parse.
  if (response.status === 304) {
    return undefined as T;
  }

  if (!response.ok) {
    const problem = await readProblem(response);
    // Tài khoản bị khóa: buộc đăng xuất (hỗ trợ trường hợp mất realtime/đang thao tác)
    if (response.status === 403) {
      const text = `${problem?.title ?? ''} ${problem?.detail ?? ''}`.toLowerCase();
      if (text.includes('bị khóa') || text.includes('banned')) {
        useSessionStore.getState().clearSession();
      }
    }
    const message =
      problem?.detail?.trim() ||
      problem?.title?.trim() ||
      `Request failed with status ${response.status}`;
    throw new ApiError(response.status, problem, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) };
}
