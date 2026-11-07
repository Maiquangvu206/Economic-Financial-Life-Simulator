import type { ExtendedError, Socket } from 'socket.io';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import type { UserRole } from '@efls/contracts';
import { env } from './config/env.js';
import type { SocketActor } from './types.js';

interface AccessPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  type: 'access';
}

export function authenticateSocket(socket: Socket, next: (err?: ExtendedError) => void): void {
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
    const actor: SocketActor = { id: payload.sub, role: payload.role };
    socket.data.actor = actor;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
}
