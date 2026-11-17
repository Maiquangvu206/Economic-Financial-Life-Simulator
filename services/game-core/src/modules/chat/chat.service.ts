import { ChatRepository } from './chat.repository.js';

export class ChatService {
  constructor(private readonly repo = new ChatRepository()) {}

  async searchUsers(q: string) {
    const rows = await this.repo.searchUsers((q || '').trim(), 20);
    return rows.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      username: r.username ?? undefined,
      role: r.role,
      characterId: r.character_id,
      isOnline: false, // realtime presence not exposed via DB; client can treat optimistically
    }));
  }

  async listConversations(userId: string) {
    const rows = await this.repo.listConversations(userId, 50);
    return rows.map((r) => ({
      peerUserId: r.peer_user_id,
      displayName: r.display_name,
      role: r.role,
      isOnline: false,
      lastMessage: r.last_message,
      lastAt: r.last_at ? r.last_at.toISOString() : null,
      unreadCount: Number(r.unread_count || 0),
    }));
  }

  async markRead(userId: string, peerUserId: string) {
    await this.repo.markRead(userId, peerUserId);
    return { ok: true };
  }
}
