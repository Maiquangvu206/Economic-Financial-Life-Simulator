import { pool } from '../../shared/db/pool.js';
import { writeActionLog } from '../../shared/audit/actionLog.js';
import { publishToAllUsers } from '../../shared/realtime/publish.js';
import type { CreateSystemBroadcastRequest, SystemBroadcastDto } from '@efls/contracts';

function toDto(row: any): SystemBroadcastDto {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type,
    scope: row.scope,
    pinned: !!row.pinned,
    sender: row.sender,
    showOnLogin: row.show_on_login === true,
    showInApp: row.show_in_app !== false,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class BroadcastService {
  /** Thông báo hiển thị trong ứng dụng/trang người dùng (sau đăng nhập) */
  async listPublic(limit = 50): Promise<SystemBroadcastDto[]> {
    const r = await pool.query(
      `SELECT id, title, content, type, scope, pinned, sender, show_on_login, show_in_app, created_at
       FROM system_broadcasts
       WHERE COALESCE(show_in_app, true) = true
       ORDER BY pinned DESC, created_at DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 100)],
    );
    return r.rows.map(toDto);
  }

  /** Thông báo hiển thị tại trang đăng nhập/trang chủ (trước đăng nhập) */
  async listForLogin(limit = 30): Promise<SystemBroadcastDto[]> {
    const r = await pool.query(
      `SELECT id, title, content, type, scope, pinned, sender, show_on_login, show_in_app, created_at
       FROM system_broadcasts
       WHERE COALESCE(show_on_login, false) = true
       ORDER BY pinned DESC, created_at DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 50)],
    );
    return r.rows.map(toDto);
  }

  async listAdmin(limit = 100): Promise<SystemBroadcastDto[]> {
    const r = await pool.query(
      `SELECT id, title, content, type, scope, pinned, sender, show_on_login, show_in_app, created_at
       FROM system_broadcasts
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 200)],
    );
    return r.rows.map(toDto);
  }

  async create(actorId: string | null | undefined, input: CreateSystemBroadcastRequest): Promise<SystemBroadcastDto> {
    const showOnLogin = input.showOnLogin === true;
    const showInApp = input.showInApp !== false;
    if (!showOnLogin && !showInApp) {
      // đảm bảo có ít nhất một vị trí hiển thị
      throw new Error('Broadcast must be visible on login and/or in app');
    }

    const r = await pool.query(
      `INSERT INTO system_broadcasts (id, title, content, type, scope, pinned, sender, sender_actor_id, show_on_login, show_in_app)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, content, type, scope, pinned, sender, show_on_login, show_in_app, created_at`,
      [
        input.title,
        input.content,
        input.type ?? 'news',
        input.scope ?? 'all',
        input.pinned ?? false,
        'Ban Quản trị',
        actorId ?? null,
        showOnLogin,
        showInApp,
      ],
    );
    const dto = toDto(r.rows[0]);

    // chỉ fanout notification/realtime tới người dùng trong ứng dụng khi hiển thị in-app
    if (showInApp) {
      try {
        await pool.query(
          `INSERT INTO notifications (id, user_id, kind, title, body, payload)
           SELECT gen_random_uuid(), u.id, 'system_broadcast', $1, $2, $3::jsonb
           FROM users u`,
          [
            dto.title,
            dto.content.slice(0, 500),
            JSON.stringify({ broadcastId: dto.id, type: dto.type, scope: dto.scope, pinned: dto.pinned, showOnLogin, showInApp }),
          ],
        );
      } catch {
        // không làm fail broadcast nếu fanout notification lỗi
      }
      await publishToAllUsers('notification', {
        kind: 'system_broadcast',
        title: dto.title,
        body: dto.content.slice(0, 200),
        at: Date.now(),
        pinned: dto.pinned,
        type: dto.type,
      });
    }

    await writeActionLog(pool as any, actorId ?? null, 'broadcast.create', {
      broadcastId: dto.id,
      title: dto.title,
      type: dto.type,
      scope: dto.scope,
      pinned: dto.pinned,
      showOnLogin,
      showInApp,
    });
    return dto;
  }

  async remove(actorId: string | null | undefined, id: string): Promise<void> {
    await pool.query(`DELETE FROM system_broadcasts WHERE id = $1`, [id]);
    await writeActionLog(pool as any, actorId ?? null, 'broadcast.delete', { broadcastId: id });
  }
}

export const broadcastService = new BroadcastService();
