import { pool } from '../../shared/db/pool.js';

export interface ChatUserRow {
  id: string; // user id
  display_name: string;
  username: string | null;
  role: string;
  character_id: string | null;
}

export interface ChatConversationRow {
  peer_user_id: string;
  display_name: string;
  role: string;
  last_message: string | null;
  last_at: Date | null;
  unread_count: string;
}

export class ChatRepository {
  async searchUsers(q: string, limit = 20): Promise<ChatUserRow[]> {
    const raw = (q || '').trim();
    const like = `%${raw.toLowerCase()}%`;
    const res = await pool.query<ChatUserRow>(
      `SELECT u.id,
              COALESCE(NULLIF(c.full_name,''), NULLIF(u.username,''), u.email) AS display_name,
              u.username,
              u.role,
              c.id AS character_id
       FROM users u
       LEFT JOIN LATERAL (
         SELECT id, full_name, cccd
         FROM characters ch
         WHERE ch.user_id = u.id
         ORDER BY COALESCE(ch.is_alive, true) DESC, ch.created_at DESC
         LIMIT 1
       ) c ON true
       WHERE (
         $1 = ''
         OR LOWER(COALESCE(c.full_name,'')) LIKE $2
         OR LOWER(COALESCE(u.username,'')) LIKE $2
         OR LOWER(u.email) LIKE $2
         OR c.id::text = $1
         OR u.id::text = $1
         OR COALESCE(c.cccd,'') = $1
         OR c.id::text ILIKE $2
         OR u.id::text ILIKE $2
       )
       ORDER BY
         CASE
           WHEN c.id::text = $1 OR u.id::text = $1 OR COALESCE(c.cccd,'') = $1 THEN 0
           WHEN LOWER(COALESCE(c.full_name,'')) = LOWER($1) OR LOWER(COALESCE(u.username,'')) = LOWER($1) THEN 1
           ELSE 2
         END,
         COALESCE(c.full_name, u.username, u.email) ASC
       LIMIT $3`,
      [raw, like, limit],
    );
    return res.rows;
  }

  async listConversations(userId: string, limit = 50): Promise<ChatConversationRow[]> {
    // derive conversations from chat_messages (private only)
    const res = await pool.query<ChatConversationRow>(
      `WITH pairs AS (
         SELECT
           CASE WHEN sender_user_id = $1 THEN receiver_user_id ELSE sender_user_id END AS peer_user_id,
           MAX(created_at) AS last_at
         FROM chat_messages
         WHERE channel = 'private' AND (sender_user_id = $1 OR receiver_user_id = $1)
         GROUP BY 1
       ),
       last_msg AS (
         SELECT DISTINCT ON (CASE WHEN m.sender_user_id = $1 THEN m.receiver_user_id ELSE m.sender_user_id END)
           CASE WHEN m.sender_user_id = $1 THEN m.receiver_user_id ELSE m.sender_user_id END AS peer_user_id,
           m.content AS last_message,
           m.created_at AS last_at
         FROM chat_messages m
         WHERE m.channel = 'private' AND (m.sender_user_id = $1 OR m.receiver_user_id = $1)
         ORDER BY CASE WHEN m.sender_user_id = $1 THEN m.receiver_user_id ELSE m.sender_user_id END, m.created_at DESC
       ),
       reads AS (
         SELECT peer_user_id, last_read_at
         FROM chat_conversation_reads
         WHERE user_id = $1
       ),
       unread AS (
         SELECT m.sender_user_id AS peer_user_id, COUNT(*)::bigint AS unread_count
         FROM chat_messages m
         JOIN pairs p ON p.peer_user_id = m.sender_user_id
         LEFT JOIN reads r ON r.peer_user_id = m.sender_user_id
         WHERE m.channel = 'private'
           AND m.receiver_user_id = $1
           AND m.created_at > COALESCE(r.last_read_at, '1970-01-01'::timestamptz)
         GROUP BY m.sender_user_id
       )
       SELECT p.peer_user_id,
              COALESCE(NULLIF(c.full_name,''), NULLIF(u.username,''), u.email, 'Người dùng') AS display_name,
              COALESCE(u.role,'player') AS role,
              lm.last_message,
              lm.last_at,
              COALESCE(u2.unread_count, 0)::text AS unread_count
       FROM pairs p
       JOIN last_msg lm ON lm.peer_user_id = p.peer_user_id
       LEFT JOIN unread u2 ON u2.peer_user_id = p.peer_user_id
       LEFT JOIN users u ON u.id = p.peer_user_id
       LEFT JOIN LATERAL (
         SELECT id, full_name FROM characters ch
         WHERE ch.user_id = u.id
         ORDER BY COALESCE(ch.is_alive, true) DESC, ch.created_at DESC
         LIMIT 1
       ) c ON true
       ORDER BY lm.last_at DESC NULLS LAST
       LIMIT $2`,
      [userId, limit],
    );
    return res.rows;
  }

  async markRead(userId: string, peerUserId: string): Promise<void> {
    await pool.query(
      `INSERT INTO chat_conversation_reads (user_id, peer_user_id, last_read_at)
       VALUES ($1,$2, now())
       ON CONFLICT (user_id, peer_user_id) DO UPDATE SET last_read_at = now()`,
      [userId, peerUserId],
    );
  }

  async getPrivateHistory(userId: string, peerUserId: string, limit = 200): Promise<Array<{
    id: string; client_msg_id: string | null; channel: string; sender_user_id: string; sender_name: string; sender_role: string; receiver_user_id: string | null; content: string; created_at: Date;
  }>> {
    const lim = Math.max(1, Math.min(500, Math.trunc(limit || 200)));
    const res = await pool.query(
      `SELECT id, client_msg_id, channel, sender_user_id, sender_name, sender_role, receiver_user_id, content, created_at
       FROM chat_messages
       WHERE channel = 'private'
         AND ((sender_user_id = $1 AND receiver_user_id = $2) OR (sender_user_id = $2 AND receiver_user_id = $1))
       ORDER BY created_at ASC
       LIMIT $3`,
      [userId, peerUserId, lim],
    );
    return res.rows as any;
  }
}
