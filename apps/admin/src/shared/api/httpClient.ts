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
}

async function readProblem(response: Response): Promise<ProblemDetails | null> {
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return null;
  }
}

async function refreshAdminToken(): Promise<string | null> {
  const session = getAdminSession();
  if (!session) return null;

  try {
    const response = await fetch(`${env.apiBaseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!response.ok) {
      clearAdminSession();
      return null;
    }
    const data = (await response.json()) as TokenPair;
    setAdminSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
    return data.accessToken;
  } catch {
    return null;
  }
}

async function send(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${env.apiBaseUrl}${path}`, { ...init, headers });
}

export async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let token = getAdminAccessToken();
  let response = await send(path, init, token);

  if (response.status === 401 && token) {
    token = await refreshAdminToken();
    if (token) {
      response = await send(path, init, token);
    }
  }

  if (response.status === 401 && !path.startsWith('/api/v1/auth/')) {
    clearAdminSession();
    if (window.location.pathname !== '/sso') {
      window.location.replace(`${env.portalUrl}/login?next=admin`);
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readProblem(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
