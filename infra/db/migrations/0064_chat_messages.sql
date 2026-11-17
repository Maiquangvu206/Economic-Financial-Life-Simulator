-- Chat realtime: lưu tin nhắn và trạng thái đọc để hỗ trợ hội thoại gần đây / chưa đọc.
-- (Bổ sung persistence cho tính năng chat riêng/tổng; client vẫn có thể hoạt động realtime.)

BEGIN;

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_msg_id text NULL,
  channel text NOT NULL, -- 'global' hoặc 'private'
  sender_user_id uuid NOT NULL,
  sender_character_id uuid NULL,
  sender_name text NOT NULL,
  sender_role text NOT NULL,
  receiver_user_id uuid NULL, -- NULL với chat global
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_global_idx ON chat_messages (created_at DESC) WHERE channel = 'global';
CREATE INDEX IF NOT EXISTS chat_messages_private_pair_idx ON chat_messages (sender_user_id, receiver_user_id, created_at DESC) WHERE channel = 'private';
CREATE INDEX IF NOT EXISTS chat_messages_private_receiver_idx ON chat_messages (receiver_user_id, created_at DESC) WHERE channel = 'private';

CREATE TABLE IF NOT EXISTS chat_conversation_reads (
  user_id uuid NOT NULL,
  peer_user_id uuid NOT NULL, -- với global dùng user_id chính nó không phù hợp; global không track unread ở đây
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_user_id)
);

COMMIT;
