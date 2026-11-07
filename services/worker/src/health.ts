import { createServer } from 'node:http';
import { env } from './config/env.js';

export function createHealthServer() {
  return createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'worker' }));
      return;
    }
    res.writeHead(404).end();
  }).listen(env.WORKER_METRICS_PORT);
}
