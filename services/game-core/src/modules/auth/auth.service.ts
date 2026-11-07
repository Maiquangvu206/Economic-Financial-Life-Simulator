import bcrypt from 'bcryptjs';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { LoginRequest, RegisterRequest, SessionUser, TokenPair } from '@efls/contracts';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { AuthRepository, type UserRow } from './auth.repository.js';

interface RefreshPayload extends JwtPayload {
  sub: string;
  type: 'refresh';
}

function toSessionUser(user: UserRow): SessionUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
  };
}

function issueTokens(user: UserRow): TokenPair {
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] },
  );

  const refreshToken = jwt.sign({ sub: user.id, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'],
  });

  return {
    accessToken,
    refreshToken,
    expiresInSeconds: 15 * 60,
    user: toSessionUser(user),
  };
}

export class AuthService {
  constructor(private readonly repository: AuthRepository = new AuthRepository()) {}

  async register(input: RegisterRequest): Promise<TokenPair> {
    if (await this.repository.emailExists(input.email)) {
      throw AppError.conflict('email_taken', 'Email is already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const { user } = await this.repository.createWithCharacter({
      email: input.email,
      username: input.username,
      passwordHash,
      fullName: input.username,
    });

    return issueTokens(user);
  }

  async login(input: LoginRequest): Promise<TokenPair> {
    const user = await this.repository.findByEmail(input.email);
    if (!user) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
    if (!passwordMatches) {
      throw AppError.unauthorized('Invalid email or password');
    }

    return issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    const user = await this.repository.findById(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }

    return issueTokens(user);
  }
}
