#!/usr/bin/env node
/**
 * End-to-end smoke test for the Docker backend stack.
 *
 *   pnpm smoke
 *   SMOKE_BASE_URL=http://localhost:3000 pnpm smoke
 *
 * Verifies: every health endpoint, register -> login -> character/me through
 * the public gateway. Exits non-zero on the first failure.
 */

const gateway = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const services = [
  ['api-gateway', gateway],
  ['game-core', process.env.SMOKE_CORE_URL ?? 'http://localhost:4000'],
  ['realtime', process.env.SMOKE_REALTIME_URL ?? 'http://localhost:5000'],
  ['worker', process.env.SMOKE_WORKER_URL ?? 'http://localhost:6060'],
  ['ai', process.env.SMOKE_AI_URL ?? 'http://localhost:8000'],
];

async function request(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${response.status}: ${text}`);
  }
  return body;
}

for (const [name, url] of services) {
  const body = await request(`${url}/health`);
  if (body?.status !== 'ok') {
    throw new Error(`${name} health returned ${JSON.stringify(body)}`);
  }
  console.log(`[ok] ${name.padEnd(12)} ${url}/health`);
}

const suffix = Date.now().toString(36);
const email = `smoke-${suffix}@efls.local`;
const password = 'SmokeTest123!';

const registered = await request(`${gateway}/api/v1/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, username: `smoke_${suffix}`, password }),
});
if (!registered?.accessToken) {
  throw new Error('register did not return an access token');
}

const session = await request(`${gateway}/api/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const character = await request(`${gateway}/api/v1/characters/me`, {
  headers: { Authorization: `Bearer ${session.accessToken}` },
});
if (!character?.id) {
  throw new Error('characters/me did not return a character');
}

console.log(`[ok] auth + character ${character.fullName} (${character.id})`);
console.log('\nSmoke test passed.');
