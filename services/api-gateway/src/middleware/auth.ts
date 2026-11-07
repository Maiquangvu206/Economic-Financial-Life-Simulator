import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { UserRole } from '@efls/contracts';
import { env } from '../config/env.js';

export interface Actor {
  id: string;
  role: UserRole;
}

export interface AuthedRequest extends Request {
  actor?: Actor;
}

interface AccessTokenPayload extends jwt.JwtPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

export function requireAccessToken(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({
      type: 'https://efls.game/errors/unauthorized',
      title: 'Missing access token',
      status: 401,
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
    if (payload.type !== 'access' || !payload.sub) {
      throw new Error('Invalid token type');
    }
    req.actor = { id: payload.sub, role: payload.role };
    next();
  } catch {
    res.status(401).json({
      type: 'https://efls.game/errors/unauthorized',
      title: 'Invalid or expired access token',
      status: 401,
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.actor || !roles.includes(req.actor.role)) {
      res.status(403).json({
        type: 'https://efls.game/errors/forbidden',
        title: 'Insufficient role',
        status: 403,
      });
      return;
    }
    next();
  };
}
