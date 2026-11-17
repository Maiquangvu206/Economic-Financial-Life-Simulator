import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';

const { Client } = pg;

function resolveDatabaseUrl() {
  const direct =
    process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.PGDATABASE_URL;
  if (direct) return direct;
  const host = process.env.POSTGRES_HOST || 'localhost';
  const port = process.env.POSTGRES_PORT || '5432';
  const user = process.env.POSTGRES_USER || 'efls';
  const password = process.env.POSTGRES_PASSWORD || 'efls';
  const db = process.env.POSTGRES_DB || 'efls';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

async function main() {
  const sqlPath = path.resolve(process.cwd(), 'scripts/cleanup-demo-data.sql');
  const sql = await readFile(sqlPath, 'utf8');
  const connectionString = resolveDatabaseUrl();
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  console.log(`[cleanup] Connecting to database...`);
  await client.connect();
  try {
    console.log(`[cleanup] Running ${sqlPath}`);
    const res = await client.query(sql);
    // show last command results if any
    const last = Array.isArray(res) ? res[res.length - 1] : res;
    if (last && last.rows) {
      console.log('[cleanup] Result:', JSON.stringify(last.rows, null, 2));
    }
    console.log('[cleanup] Completed successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[cleanup] Failed:', err?.message || err);
  process.exitCode = 1;
});