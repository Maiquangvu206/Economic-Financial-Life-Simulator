-- Chat retention cleanup (EFLS)
-- Deletes old chat messages and orphaned read-state rows to control DB growth.
-- Usage:
--   psql "$DATABASE_URL" -v days=30 -f scripts/chat-retention.sql
-- Default: 30 days if :days not provided.

\if :{?days}
\else
\set days 30
\endif

BEGIN;

-- Remove old messages
DELETE FROM chat_messages
WHERE created_at < now() - (:'days'::int * interval '1 day');

-- Remove read markers for conversations with no remaining messages (optional hygiene)
DELETE FROM chat_conversation_reads r
WHERE NOT EXISTS (
  SELECT 1 FROM chat_messages m
  WHERE (m.channel = 'private' AND ((m.sender_user_id = r.user_id AND m.receiver_user_id = r.peer_user_id)
      OR (m.sender_user_id = r.peer_user_id AND m.receiver_user_id = r.user_id)))
);

COMMIT;

-- Stats (informational)
SELECT count(*) AS chat_messages_remaining FROM chat_messages;
SELECT count(*) AS chat_read_states_remaining FROM chat_conversation_reads;
