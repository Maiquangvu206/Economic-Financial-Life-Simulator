-- 0094_chat_unread_query_index.sql
-- Tối ưu truy vấn hội thoại/chưa đọc: đếm tin nhắn đến theo (receiver, sender, created_at)

BEGIN;

CREATE INDEX IF NOT EXISTS chat_messages_private_unread_idx
  ON chat_messages (receiver_user_id, sender_user_id, created_at DESC)
  WHERE channel = 'private';

INSERT INTO schema_migrations (filename) VALUES ('0094_chat_unread_query_index.sql')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
