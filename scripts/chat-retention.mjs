import pg from 'pg';

const { Client } = pg;

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.PGDATABASE_URL ||
    `postgresql://${encodeURIComponent(process.env.POSTGRES_USER || 'efls')}:${encodeURIComponent(process.env.POSTGRES_PASSWORD || 'efls')}@${process.env.POSTGRES_HOST || '127.0.0.1'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'efls'}`
  );
}

const days = Number.parseInt(process.env.CHAT_RETENTION_DAYS || process.argv[2] || '30', 10);
if (!Number.isFinite(days) || days < 1) {
  console.error('Usage: CHAT_RETENTION_DAYS=30 node scripts/chat-retention.mjs  (or pass days as arg)');
  process.exit(1);
}

const sql = `
BEGIN;
DELETE FROM chat_messages WHERE created_at < now() - ($1::int * interval '1 day');
DELETE FROM chat_conversation_reads r
WHERE NOT EXISTS (
  SELECT 1 FROM chat_messages m
  WHERE m.channel = 'private' AND (
    (m.sender_user_id = r.user_id AND m.receiver_user_id = r.peer_user_id) OR
    (m.sender_user_id = r.peer_user_id AND m.receiver_user_id = r.user_id)
  )
);
COMMIT;
SELECT
  (SELECT count(*) FROM chat_messages) AS chat_messages_remaining,
  (SELECT count(*) FROM chat_conversation_reads) AS chat_read_states_remaining;
`;

const client = new Client({ connectionString: resolveDatabaseUrl(), connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  const res = await client.query(sql, [days]);
  const rows = Array.isArray(res) ? res[res.length - 1]?.rows : res?.rows;
  console.log(`[chat-retention] days=${days} done`, rows?.[0] ?? {});
} catch (err) {
  console.error('[chat-retention] failed:', err?.message || err);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
