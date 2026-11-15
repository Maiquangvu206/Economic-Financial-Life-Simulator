import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type {
  AccountProfileResponse,
  ChangePasswordRequest,
  LoginRequest,
  RegisterRequest,
  SessionUser,
  SsoHandoffResponse,
  TokenPair,
  UpdateAccountProfileRequest,
} from '@efls/contracts';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/http/errors.js';
import { AuthRepository, type UserRow } from './auth.repository.js';

interface RefreshPayload extends JwtPayload {
  sub: string;
  type: 'refresh';
}

/** Mã bàn giao đăng nhập dùng một lần, sống rất ngắn. */
const HANDOFF_TTL_SECONDS = 60;

interface HandoffTicket {
  userId: string;
  expiresAt: number;
}

/**
 * Bộ nhớ tiến trình là đủ cho một instance game-core.
 * Nếu chạy nhiều replica, thay bằng Redis để mã dùng chung giữa các instance.
 */
const handoffTickets = new Map<string, HandoffTicket>();

function pruneExpiredTickets(): void {
  const now = Date.now();
  for (const [code, ticket] of handoffTickets) {
    if (ticket.expiresAt <= now) handoffTickets.delete(code);
  }
}

function toSessionUser(user: UserRow): SessionUser {
  const status = (user.status ?? 'active') as SessionUser['status'];
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    status,
    restrictionReason: status === 'restricted' ? (user.ban_reason ?? null) : null,
  };
}

/** Bị khóa (banned) không được đăng nhập; bị hạn chế (restricted) vẫn đăng nhập nhưng sẽ bị chặn thao tác trong game. */
function ensureCanAuthenticate(user: UserRow): void {
  const status = user.status ?? 'active';
  if (status === 'banned') {
    const until = user.banned_until ? ` đến ${new Date(user.banned_until).toLocaleString('vi-VN')}` : '';
    const reason = user.ban_reason ? ` Lý do: ${user.ban_reason}` : '';
    throw AppError.forbidden(`Tài khoản đã bị khóa${until}.${reason}`.trim());
  }
}

function issueTokens(user: UserRow): TokenPair {
  ensureCanAuthenticate(user);
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
      fullName: input.fullName?.trim() ? input.fullName : input.username,
      birthplaceCode: input.birthplaceCode ?? '001',
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

    ensureCanAuthenticate(user);
    return issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const payload = this.verifyRefreshToken(refreshToken);
    const user = await this.repository.findById(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }
    ensureCanAuthenticate(user);
    return issueTokens(user);
  }

  /**
   * Portal gọi sau khi đăng nhập thành công để lấy mã bàn giao dùng một lần.
   * Mã này chỉ đổi được đúng một lần, trong 60 giây.
   */
  async createHandoff(refreshToken: string): Promise<SsoHandoffResponse> {
    const payload = this.verifyRefreshToken(refreshToken);
    const user = await this.repository.findById(payload.sub);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }
    ensureCanAuthenticate(user);

    pruneExpiredTickets();
    const code = randomBytes(32).toString('hex');
    handoffTickets.set(code, {
      userId: user.id,
      expiresAt: Date.now() + HANDOFF_TTL_SECONDS * 1000,
    });

    return { code, expiresInSeconds: HANDOFF_TTL_SECONDS };
  }

  /** Ứng dụng đích đổi mã bàn giao lấy phiên đăng nhập của chính nó. */
  async exchangeHandoff(code: string): Promise<TokenPair> {
    pruneExpiredTickets();
    const ticket = handoffTickets.get(code);
    if (!ticket) {
      throw AppError.unauthorized('Invalid or expired handoff code');
    }
    handoffTickets.delete(code);

    const user = await this.repository.findById(ticket.userId);
    if (!user) {
      throw AppError.unauthorized('User no longer exists');
    }
    ensureCanAuthenticate(user);
    return issueTokens(user);
  }

  async changePassword(userId: string, input: ChangePasswordRequest): Promise<{ ok: true; message: string }> {
    const user = await this.repository.findById(userId);
    if (!user) throw AppError.unauthorized('User no longer exists');
    ensureCanAuthenticate(user);

    const matches = await bcrypt.compare(input.currentPassword, user.password_hash);
    if (!matches) {
      throw AppError.badRequest('Mật khẩu hiện tại không chính xác.');
    }
    if (input.currentPassword === input.newPassword) {
      throw AppError.badRequest('Mật khẩu mới phải khác mật khẩu hiện tại.');
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await this.repository.updatePassword(userId, passwordHash);
    return { ok: true, message: 'Đã đổi mật khẩu thành công.' };
  }

  async updateProfile(userId: string, input: UpdateAccountProfileRequest): Promise<AccountProfileResponse> {
    const current = await this.repository.findById(userId);
    if (!current) throw AppError.unauthorized('User no longer exists');
    ensureCanAuthenticate(current);

    // Email là định danh tài khoản, không cho phép thay đổi.
    if (input.email != null && input.email.trim().toLowerCase() !== current.email.toLowerCase()) {
      throw AppError.badRequest('Email tài khoản không thể thay đổi.');
    }

    const username = input.username?.trim();
    if (!username || username === current.username) {
      throw AppError.badRequest('Bạn chưa thay đổi tên đăng nhập.');
    }

    try {
      const updated = await this.repository.updateAccountProfile({
        userId,
        username,
      });
      return {
        user: toSessionUser(updated),
        message: 'Đã cập nhật tên đăng nhập tài khoản.',
      };
    } catch (e: any) {
      if (e?.code === 'conflict_email' || e?.message === 'email_taken') {
        throw AppError.conflict('email_taken', 'Email đã được sử dụng.');
      }
      if (e?.code === 'conflict_username' || e?.message === 'username_taken') {
        throw AppError.conflict('username_taken', 'Tên đăng nhập đã được sử dụng.');
      }
      if (e?.code === 'not_found') {
        throw AppError.notFound('Tài khoản');
      }
      throw e;
    }
  }

  private verifyRefreshToken(refreshToken: string): RefreshPayload {
    let payload: RefreshPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET) as RefreshPayload;
    } catch {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    return payload;
  }
}
