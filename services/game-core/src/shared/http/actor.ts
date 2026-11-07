import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@efls/contracts';
import { env } from '../../config/env.js';
import { AppError } from './errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actorId?: string;
      actorRole?: UserRole;
    }
  }
}

/** Only the gateway (or another trusted internal service) may call core. */
export function requireInternalToken(req: Request, _res: Response, next: NextFunction): void {
  const token = req.header('x-internal-token');
  if (!token || token !== env.INTERNAL_SERVICE_TOKEN) {
    next(AppError.unauthorized('Missing or invalid internal service token'));
    return;
  }
  next();
}

/** Actor identity is asserted by the gateway after JWT verification. */
export function attachActor(req: Request, _res: Response, next: NextFunction): void {
  const actorId = req.header('x-actor-id');
  if (!actorId) {
    next(AppError.unauthorized('Missing actor identity'));
    return;
  }
  const role = req.header('x-actor-role');
  req.actorId = actorId;
  req.actorRole = role === 'admin' || role === 'moderator' ? role : 'player';
  next();
}

export function requireActorId(req: Request): string {
  if (!req.actorId) {
    throw AppError.unauthorized();
  }
  return req.actorId;
}
