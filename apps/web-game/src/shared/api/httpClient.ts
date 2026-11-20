import type { ProblemDetails } from '@efls/contracts';
import { env } from '../config/env';
import { useSessionStore } from '../../features/auth/sessionStore';

export type ApiErrorKind = 'http' | 'network' | 'timeout';

export class ApiError extends Error {
  readonly status: number;
  readonly problem: ProblemDetails | null;
  readonly kind: ApiErrorKind;

  constructor(
    status: number,
    problem: ProblemDetails | null,
    message: string,
    kind: ApiErrorKind = 'http',
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problem = problem;
    this.kind = kind;
  }

  get isTransient(): boolean {
    return this.kind !== 'http' || this.status === 429 || this.status >= 500;
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

function timeoutFor(init: RequestInit): number {
  return isIdempotent(init) ? GET_TIMEOUT_MS : MUTATION_TIMEOUT_MS;
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
  timeoutMs = timeoutFor(init),
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const external = init.signal;
  const forwardAbort = () => controller.abort();
  external?.addEventListener('abort', forwardAbort);

  try {
    // Tránh 304/ETag conditional GET làm fetch trả body rỗng và client coi là lỗi.
    return await fetch(`${env.apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    // Phân biệt "máy chủ chậm/mất mạng" với "phiên hết hạn": hai lỗi này phải
    // được xử lý khác nhau, nếu không người chơi bị đăng xuất oan.
    if ((error as { name?: string } | null)?.name === 'AbortError') {
      throw new ApiError(0, null, 'Máy chủ phản hồi quá lâu. Vui lòng thử lại.', 'timeout');
    }
    throw new ApiError(0, null, 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra mạng và thử lại.', 'network');
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', forwardAbort);
  }
}

/** GET/HEAD: thử lại 1 lần khi lỗi mạng/timeout. Mutation: không tự retry. */
async function sendWithRetry(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Response> {
  try {
    return await send(path, init, token);
  } catch (error) {
    if (!(error instanceof ApiError) || !isIdempotent(init)) throw error;
    if (error.kind !== 'network' && error.kind !== 'timeout') throw error;
    await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 300));
    return send(path, init, token);
  }
}

type RefreshOutcome =
  | { status: 'ok'; token: string }
  | { status: 'invalid' }
  | { status: 'transient' };

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function refreshAccessToken(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async (): Promise<RefreshOutcome> => {
    const { refreshToken, setSession, clearSession } = useSessionStore.getState();
    if (!refreshToken) return { status: 'invalid' };

    let response: Response;
    try {
      response = await send(
        '/api/v1/auth/refresh',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ refreshToken }),
        },
        null,
        GET_TIMEOUT_MS,
      );
    } catch {
      // Mất mạng/timeout: giữ nguyên phiên, chỉ báo lỗi tạm thời.
      return { status: 'transient' };
    }

    if (response.status === 401 || response.status === 403) {
      // Chỉ đăng xuất nếu phiên hiện tại vẫn dùng refresh token này (tránh
      // đăng xuất oan khi có luồng làm mới khác thành công).
      const current = useSessionStore.getState().refreshToken;
      if (current === refreshToken) clearSession();
      return { status: 'invalid' };
    }

    // 429/5xx/502/504: máy chủ tạm thời không xử lý được, KHÔNG xóa phiên.
    if (!response.ok) return { status: 'transient' };

    try {
      const data = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
        expiresInSeconds: number;
        user: NonNullable<ReturnType<typeof useSessionStore.getState>['user']>;
      };
      setSession(data);
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

/** Tạo Idempotency-Key (UUID) cho các giao dịch quan trọng để chống bấm lặp. */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = useSessionStore.getState().accessToken;
  let response = await sendWithRetry(path, init, token);
  let refreshed: RefreshOutcome | null = null;

  // Access token hết hạn (15 phút): thử refresh một lần rồi gửi lại request.
  if (response.status === 401 && token) {
    refreshed = await refreshAccessToken();
    if (refreshed.status === 'ok') {
      token = refreshed.token;
      response = await sendWithRetry(path, init, token);
    }
  }

  // Lỗi 502/503/504 tạm thời: thử lại một lần với request idempotent.
  if (
    isIdempotent(init) &&
    (response.status === 502 || response.status === 503 || response.status === 504)
  ) {
    await sleep(RETRY_DELAY_MS + Math.floor(Math.random() * 300));
    response = await sendWithRetry(path, init, token);
  }

  if (response.status === 401) {
    // Chỉ xóa phiên khi refresh chứng minh phiên không còn hợp lệ. Lỗi mạng/
    // 429/5xx ở bước refresh không được phép đăng xuất người chơi.
    if (refreshed?.status === 'invalid' || !useSessionStore.getState().refreshToken) {
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
    const retryAfter = response.headers.get('Retry-After');
    const message =
      problem?.detail?.trim() ||
      problem?.title?.trim() ||
      (response.status === 429
        ? `Hệ thống đang quá tải${retryAfter ? `, vui lòng thử lại sau ${retryAfter} giây` : ''}.`
        : `Request failed with status ${response.status}`);
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
