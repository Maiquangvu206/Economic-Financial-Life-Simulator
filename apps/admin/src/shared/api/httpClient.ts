import type { ProblemDetails, TokenPair } from '@efls/contracts';
import { env } from '../config/env';
import {
  clearAdminSession,
  getAdminAccessToken,
  getAdminSession,
  setAdminSession,
} from '../../features/auth/session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.title ?? `Admin request failed (${status})`);
  }

  get isTransient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

const GET_TIMEOUT_MS = 15_000;
const MUTATION_TIMEOUT_MS = 30_000;
const RETRY_DELAY_MS = 400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIdempotent(init: RequestInit): boolean {
  const method = (init.method ?? 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

async function readProblem(response: Response): Promise<ProblemDetails | null> {
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return null;
  }
}

async function send(
  path: string,
  init: RequestInit,
  token: string | null,
  timeoutMs = isIdempotent(init) ? GET_TIMEOUT_MS : MUTATION_TIMEOUT_MS,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = init.signal;
  const forwardAbort = () => controller.abort();
  external?.addEventListener('abort', forwardAbort);

  try {
    return await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, null);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forwardAbort);
  }
}

async function sendWithRetry(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Response> {
  try {
    return await send(path, init, token);
  } catch (error) {
    if (!(error instanceof ApiError) || !isIdempotent(init)) throw error;
    await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 300));
    return send(path, init, token);
  }
}

type RefreshOutcome = { status: 'ok'; token: string } | { status: 'invalid' } | { status: 'transient' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function refreshAdminToken(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshOutcome> => {
    const session = getAdminSession();
    if (!session) return { status: 'invalid' };

    let response: Response;
    try {
      response = await send(
        '/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        },
        null,
        GET_TIMEOUT_MS,
      );
    } catch {
      // Mất mạng/timeout: giữ phiên admin, chỉ báo lỗi tạm thời.
      return { status: 'transient' };
    }

    if (response.status === 401 || response.status === 403) {
      clearAdminSession();
      return { status: 'invalid' };
    }

    // 429/5xx/502/504: không đăng xuất admin oan.
    if (!response.ok) return { status: 'transient' };

    try {
      const data = (await response.json()) as TokenPair;
      setAdminSession({
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        user: data.user,
      });
      return { status: 'ok', token: data.accessToken };
    } catch {
      return { status: 'transient' };
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = getAdminAccessToken();
  let response = await sendWithRetry(path, init, token);
  let refreshed: RefreshOutcome | null = null;

  if (response.status === 401 && token) {
    refreshed = await refreshAdminToken();
    if (refreshed.status === 'ok') {
      token = refreshed.token;
      response = await sendWithRetry(path, init, token);
    }
  }

  if (
    isIdempotent(init) &&
    (response.status === 502 || response.status === 503 || response.status === 504)
  ) {
    await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 300));
    response = await sendWithRetry(path, init, token);
  }

  if (response.status === 401 && !path.startsWith('/api/v1/auth/')) {
    // Chỉ đăng xuất/redirect khi refresh xác nhận phiên không còn hợp lệ.
    if (refreshed?.status === 'invalid' || !getAdminSession()) {
      clearAdminSession();
      if (window.location.pathname !== '/sso') {
        window.location.replace(`${env.portalUrl}/login?next=admin`);
      }
    }
  }

  if (response.status === 304) return undefined as T;

  if (!response.ok) {
    throw new ApiError(response.status, await readProblem(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
