#!/usr/bin/env node
/**
 * Load test nhẹ cho EFLS: bắn requests đồng thời vào gateway/core
 * và đo độ trễ p50/p95, ghi báo cáo JSON.
 *
 * Chạy:
 *   node scripts/loadtest.mjs
 * Env: EFLS_TOKEN (JWT), EFLS_GATEWAY (default http://localhost:3000)
 */
const GATEWAY = process.env.EFLS_GATEWAY ?? 'http://localhost:3000';
const TOKEN = process.env.EFLS_TOKEN ?? '';
const CONCURRENCY = Number(process.env.EFLS_LOAD_CONCURRENCY ?? 10);
const ROUNDS = Number(process.env.EFLS_LOAD_ROUNDS ?? 20);

const ENDPOINTS = [
  { path: '/api/v1/map', auth: true },
  { path: '/api/v1/stock-market/snapshot', auth: true },
  { path: '/api/v1/social/overview', auth: true },
  { path: '/api/v1/law/overview', auth: true },
  { path: '/api/v1/education/overview', auth: true },
  { path: '/api/v1/underworld/overview', auth: true },
];

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function timedFetch(url, headers) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers });
    await res.text();
    return { status: res.status, ms: Date.now() - started, ok: res.status < 500 };
  } catch (error) {
    return { status: 0, ms: Date.now() - started, ok: false, error: String(error) };
  }
}

async function main() {
  const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
  const results = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    const jobs = [];
    for (let c = 0; c < CONCURRENCY; c += 1) {
      for (const ep of ENDPOINTS) {
        jobs.push(
          timedFetch(`${GATEWAY}${ep.path}`, headers).then((r) => ({ ...r, path: ep.path })),
        );
      }
    }
    results.push(...(await Promise.all(jobs)));
  }
  const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
  const ok = results.filter((r) => r.ok).length;
  const report = {
    generatedAt: new Date().toISOString(),
    gateway: GATEWAY,
    concurrency: CONCURRENCY,
    rounds: ROUNDS,
    totalRequests: results.length,
    successRate: results.length > 0 ? ok / results.length : 0,
    p50Ms: percentile(latencies, 50) ?? 0,
    p95Ms: percentile(latencies, 95) ?? 0,
    avgMs: latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0,
    maxMs: latencies[latencies.length - 1] ?? 0,
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
