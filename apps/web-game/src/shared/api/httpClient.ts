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

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setSession, clearSession } = useSessionStore.getState();
  if (!refreshToken) return null;

  try {
    const response = await fetch(`${env.apiBaseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearSession();
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
  }
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
  return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers });
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
    useSessionStore.getState().clearSession();
  }

  if (!response.ok) {
    const problem = await readProblem(response);
    throw new ApiError(
      response.status,
      problem,
      problem?.title ?? `Request failed with status ${response.status}`,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function jsonBody(value: unknown): Pick<RequestInit, 'body'> {
  return { body: JSON.stringify(value) };
}
