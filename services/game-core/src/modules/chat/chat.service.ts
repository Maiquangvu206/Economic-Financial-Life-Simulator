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

  async getPrivateHistory(userId: string, peerUserId: string, limit = 200) {
    const rows = await this.repo.getPrivateHistory(userId, peerUserId, limit);
    return rows.map((m) => ({
      id: m.id,
      clientMsgId: m.client_msg_id ?? undefined,
      channel: 'private' as const,
      senderId: m.sender_user_id,
      senderName: m.sender_name,
      senderRole: m.sender_role,
      receiverId: m.receiver_user_id,
      content: m.content,
      createdAt: m.created_at instanceof Date ? m.created_at.toISOString() : new Date(m.created_at as any).toISOString(),
    }));
  }
}
