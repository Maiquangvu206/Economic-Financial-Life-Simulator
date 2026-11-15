import { Redis } from 'ioredis';
import { Rooms } from '@efls/contracts';
import { env } from '../../config/env.js';
import { pool } from '../db/pool.js';

let client: Redis | null = null;
let disabled = false;

function getClient(): Redis | null {
  if (disabled) return null;
  if (client) return client;
  if (!env.REDIS_URL) {
    disabled = true;
    return null;
  }
  client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
  client.on('error', () => {
    // best-effort realtime; avoid crashing core on publish issues
  });
  return client;
}

async function publishEnvelope(room: string, event: string, payload: unknown): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.publish(env.REALTIME_CHANNEL, JSON.stringify({ room, event, payload }));
  } catch {
    // ignore
  }
}

export async function publishToUser(userId: string, event: string, payload: unknown): Promise<void> {
  await publishEnvelope(Rooms.character(userId), event, payload);
}

export async function publishToUsers(userIds: string[], event: string, payload: unknown): Promise<void> {
  if (userIds.length === 0) return;
  const redis = getClient();
  if (!redis) return;
  // publish sequentially in small batches to avoid overwhelming redis
  for (const uid of userIds) {
    try {
      await redis.publish(env.REALTIME_CHANNEL, JSON.stringify({ room: Rooms.character(uid), event, payload }));
    } catch {
      // ignore per-user failure
    }
  }
}

export async function publishToAllUsers(event: string, payload: unknown): Promise<void> {
  try {
    const r = await pool.query<{ id: string }>(`SELECT id FROM users`);
    await publishToUsers(r.rows.map((x) => x.id), event, payload);
  } catch {
    // ignore
  }
}
