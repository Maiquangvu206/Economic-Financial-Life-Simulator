import type { ExtendedError, Socket } from 'socket.io';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { UserRole } from '@efls/contracts';
import { env } from './config/env.js';
import { resolveSocketActor } from './identity.js';

interface AccessPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

export async function authenticateSocket(socket: Socket, next: (err?: ExtendedError) => void): Promise<void> {
  const token = socket.handshake.auth?.token as string | undefined;
  if (!token) {
    next(new Error('unauthorized'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    if (payload.type !== 'access' || !payload.sub) {
      throw new Error('invalid token');
    }
    const actor = await resolveSocketActor(payload.sub, payload.role);
    socket.data.actor = actor;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}

